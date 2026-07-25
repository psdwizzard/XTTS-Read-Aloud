// Function to preprocess text with improved handling of punctuation and special cases
function preprocessText(text) {
    if (!text) return '';
    
    // First apply dictionary replacements
    return chrome.storage.local.get(['dictionary'], function(result) {
        const dictionary = result.dictionary || {};
        let processedText = text;
        
        // Replace words from dictionary
        if (Object.keys(dictionary).length > 0) {
            // Sort keys by length descending to handle longer matches first
            const sortedWords = Object.keys(dictionary).sort((a, b) => b.length - a.length);
            
            sortedWords.forEach(word => {
                // Create a regex that matches whole word with word boundaries
                const regex = new RegExp(`\\b${word}\\b`, 'gi');
                processedText = processedText.replace(regex, dictionary[word]);
            });
        }
        
        // Replace common abbreviations with full forms for better speech
        const abbreviations = {
            'Dr.': 'Doctor',
            'Mr.': 'Mister',
            'Mrs.': 'Misses',
            'Ms.': 'Miss',
            'Prof.': 'Professor',
            'etc.': 'etcetera',
            'i.e.': 'that is',
            'e.g.': 'for example'
        };
        
        // Replace abbreviations with their full forms
        Object.entries(abbreviations).forEach(([abbr, full]) => {
            const regex = new RegExp(`\\b${abbr.replace('.', '\\.')}\\b`, 'g');
            processedText = processedText.replace(regex, full);
        });
        
        // Handle parentheses - instead of removing them, we'll keep the content
        // But add slight pauses with commas to make speech more natural
        processedText = processedText.replace(/\(([^)]+)\)/g, ', $1, ');
        
        // Handle special characters and numbers
        processedText = processedText
            // Convert URLs to more speakable format
            .replace(/(https?:\/\/[^\s]+)/g, 'URL')
            // Remove excessive spaces
            .replace(/\s+/g, ' ')
            // Add pause after periods that aren't part of known abbreviations
            .replace(/(\.)(\s+|$)(?!com|org|net|gov|edu)/g, '$1, $2')
            // Add pause after question marks and exclamation points
            .replace(/([?!])(\s+|$)/g, '$1, $2');
        
        return processedText.trim();
    });
}

// Create context menu on installation
chrome.runtime.onInstalled.addListener(function() {
    chrome.contextMenus.create({
        id: "readAloud",
        title: "Read Aloud",
        contexts: ["selection"]
    });

    // Google Docs paints its text onto a <canvas>, so there is no real DOM
    // selection for the "selection" context above to attach to. Instead we
    // offer a Docs-specific item that reads whatever the user last copied
    // (Ctrl+C). It uses the "all" context because Docs never reports a
    // selection to the browser.
    chrome.contextMenus.create({
        id: "readAloudDocs",
        title: "Read Aloud (copied text)",
        contexts: ["all"],
        documentUrlPatterns: ["*://docs.google.com/*"]
    });
});

// Function to fetch voice sets from voiceSets.json
function fetchVoiceSets(callback) {
    fetch(chrome.runtime.getURL('voiceSets.json'))
        .then(response => response.json())
        .then(predefinedSets => {
            chrome.storage.local.get(['userSets'], function(result) {
                const userSets = result.userSets || [];
                const allSets = predefinedSets.concat(userSets);
                callback(allSets);
            });
        })
        .catch(error => {
            console.error('Error fetching voice sets:', error);
        });
}

// Function to fetch a random voice from a specified set
function fetchRandomVoiceFromSet(setName, voiceSets) {
    return new Promise((resolve, reject) => {
        const set = voiceSets.find(s => s.name.toLowerCase() === setName.toLowerCase());
        if (set && set.voices.length > 0) {
            const randomIndex = Math.floor(Math.random() * set.voices.length);
            const randomVoice = set.voices[randomIndex];
            resolve(randomVoice.voice_id);
        } else {
            console.error(`Set "${setName}" not found or is empty.`);
            reject(new Error(`Set "${setName}" not found or is empty.`));
        }
    });
}

const DEFAULT_RELAY_URL = 'https://your-cloudflare-url.example.com';

function isCloudflareAccessUrl(url) {
    return typeof url === 'string' && url.includes('cloudflareaccess.com');
}

function buildRelayFetchOptions(connectionMode, options = {}) {
    if (connectionMode !== 'relay') {
        return options;
    }

    return {
        ...options,
        credentials: 'include'
    };
}

function ensureRelayAuthenticated(response, relayUrl) {
    if (response.redirected && isCloudflareAccessUrl(response.url)) {
        chrome.tabs.create({ url: response.url });
        throw new Error(`Cloudflare Access sign-in required for ${relayUrl}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html') && isCloudflareAccessUrl(response.url)) {
        chrome.tabs.create({ url: response.url });
        throw new Error(`Cloudflare Access sign-in required for ${relayUrl}`);
    }

    return response;
}

function blobToDataUrl(blob) {
    return blob.arrayBuffer().then(buffer => {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
        }
        return `data:${blob.type || 'audio/wav'};base64,${btoa(binary)}`;
    });
}

function sendAudioToTab(tabId, payload) {
    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, payload, () => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            resolve();
        });
    });
}

function injectContentScript(tabId) {
    return new Promise((resolve, reject) => {
        chrome.scripting.executeScript({
            target: { tabId },
            files: ['content.js']
        }, () => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            resolve();
        });
    });
}

let creatingOffscreenDocument = null;

async function hasOffscreenDocument() {
    const offscreenUrl = chrome.runtime.getURL('offscreen.html');

    if (chrome.runtime.getContexts) {
        const contexts = await chrome.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT'],
            documentUrls: [offscreenUrl]
        });
        return contexts.length > 0;
    }

    // getContexts was added after the original offscreen API.
    return chrome.offscreen.hasDocument();
}

async function ensureOffscreenDocument() {
    if (await hasOffscreenDocument()) {
        return;
    }

    // Several synthesis requests can finish together. Only create one document.
    if (!creatingOffscreenDocument) {
        creatingOffscreenDocument = chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['AUDIO_PLAYBACK'],
            justification: 'Play synthesized read-aloud audio reliably'
        }).finally(() => {
            creatingOffscreenDocument = null;
        });
    }

    await creatingOffscreenDocument;
}

function sendAudioToOffscreen(audioUrl) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            target: 'offscreen',
            action: 'playAudio',
            audioUrl,
            speed: 1.0
        }, response => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            if (!response?.ok) {
                reject(new Error(response?.error || 'Offscreen audio playback failed'));
                return;
            }
            resolve();
        });
    });
}

async function deliverAudioToActiveTab(audioUrl) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentTabId = tabs[0]?.id;
    if (!currentTabId) {
        throw new Error('No active tab found to play audio');
    }

    const payload = {
        action: 'playAudio',
        audioUrl,
        speed: 1.0
    };

    try {
        await sendAudioToTab(currentTabId, payload);
    } catch (error) {
        const message = String(error instanceof Error ? error.message : error);
        if (!/Receiving end does not exist/i.test(message)) {
            throw error;
        }

        await injectContentScript(currentTabId);
        await sendAudioToTab(currentTabId, payload);
    }
}

async function playAudio(audioUrl) {
    try {
        await ensureOffscreenDocument();
        await sendAudioToOffscreen(audioUrl);
    } catch (error) {
        // Older Chromium builds may not support offscreen documents. Retain the
        // original page-based player as a best-effort compatibility fallback.
        console.warn('Offscreen playback unavailable; using active tab:', error);
        await deliverAudioToActiveTab(audioUrl);
    }
}

// Core read-aloud pipeline: take raw text, apply dictionary + preprocessing,
// resolve the configured voice, and synthesize. Shared by the context menu,
// the Google Docs clipboard path, and the keyboard shortcut.
function readAloudText(rawText) {
    const text = (rawText || '').trim();
    if (!text) {
        console.warn('[XTTS] Nothing to read aloud (empty text).');
        return;
    }

    chrome.storage.local.get(['selectedVoice', 'selectedSet', 'serverIp'], function(result) {
        const serverIp = result.serverIp || 'localhost';

        // Get the preprocessed text with dictionary replacements applied
        chrome.storage.local.get(['dictionary'], function(dictResult) {
            const dictionary = dictResult.dictionary || {};
            let processedText = text;

            // Apply dictionary replacements
            if (Object.keys(dictionary).length > 0) {
                // Sort keys by length descending to handle longer matches first
                const sortedWords = Object.keys(dictionary).sort((a, b) => b.length - a.length);

                sortedWords.forEach(word => {
                    // Create a regex that matches whole word with word boundaries
                    const regex = new RegExp(`\\b${word}\\b`, 'gi');
                    processedText = processedText.replace(regex, dictionary[word]);
                });
            }

            // Continue with additional preprocessing
            processedText = preprocessAdvancedText(processedText);

            fetchVoiceSets(function(voiceSets) {
                if (result.selectedSet) {
                    fetchRandomVoiceFromSet(result.selectedSet, voiceSets)
                        .then(voiceId => {
                            fetchAudio(processedText, voiceId, serverIp);
                        })
                        .catch(error => {
                            console.error('Error fetching random voice from set:', error);
                        });
                } else if (result.selectedVoice) {
                    fetchAudio(processedText, result.selectedVoice, serverIp);
                } else {
                    console.error('No voice or set selected.');
                }
            });
        });
    });
}

// Send a message to a tab's content script, injecting the script and retrying
// once if the tab has no receiver yet. Resolves with the response object.
function messageTab(tabId, message) {
    function attempt(resolve, reject, allowInject) {
        chrome.tabs.sendMessage(tabId, message, response => {
            if (chrome.runtime.lastError) {
                const errMessage = chrome.runtime.lastError.message || '';
                if (allowInject && /Receiving end does not exist/i.test(errMessage)) {
                    injectContentScript(tabId)
                        .then(() => attempt(resolve, reject, false))
                        .catch(reject);
                    return;
                }
                reject(new Error(errMessage));
                return;
            }
            resolve(response || {});
        });
    }
    return new Promise((resolve, reject) => attempt(resolve, reject, true));
}

// Ask the content script in a tab to hand back the current selection, or, if
// there is none (e.g. Google Docs), the clipboard contents.
function getReadableTextFromTab(tabId, action) {
    return messageTab(tabId, { action }).then(response => (response && response.text) || '');
}

function isGoogleDocsUrl(url) {
    return typeof url === 'string' && /^https?:\/\/docs\.google\.com\//.test(url);
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Debugger-driven copy (popup Play button, Google Docs only) -----------
//
// Google Docs only puts the selection on the clipboard in response to a real
// Ctrl+C keystroke. The chrome.debugger API can dispatch a genuine key event
// that Docs accepts. We snapshot the clipboard, send Ctrl+C, read back the
// selection, then restore the user's original clipboard. This runs ONLY from
// the popup's Play button — never from right-click or the keyboard shortcut.

function attachDebugger(tabId) {
    return new Promise((resolve, reject) => {
        chrome.debugger.attach({ tabId }, '1.3', () => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            resolve();
        });
    });
}

function detachDebugger(tabId) {
    return new Promise(resolve => {
        chrome.debugger.detach({ tabId }, () => {
            // Swallow "not attached" style errors — detach is best-effort.
            void chrome.runtime.lastError;
            resolve();
        });
    });
}

function debuggerSend(tabId, method, params) {
    return new Promise((resolve, reject) => {
        chrome.debugger.sendCommand({ tabId }, method, params || {}, result => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            resolve(result);
        });
    });
}

async function sendCopyKeystroke(tabId) {
    // Ctrl down
    await debuggerSend(tabId, 'Input.dispatchKeyEvent', {
        type: 'rawKeyDown', modifiers: 2,
        key: 'Control', code: 'ControlLeft',
        windowsVirtualKeyCode: 17, nativeVirtualKeyCode: 17
    });
    // C down, carrying the explicit "copy" editing command so Chrome performs
    // the copy on the focused editable frame (the Docs editor).
    await debuggerSend(tabId, 'Input.dispatchKeyEvent', {
        type: 'keyDown', modifiers: 2,
        key: 'c', code: 'KeyC',
        windowsVirtualKeyCode: 67, nativeVirtualKeyCode: 67,
        commands: ['Copy']
    });
    // C up
    await debuggerSend(tabId, 'Input.dispatchKeyEvent', {
        type: 'keyUp', modifiers: 2,
        key: 'c', code: 'KeyC',
        windowsVirtualKeyCode: 67, nativeVirtualKeyCode: 67
    });
    // Ctrl up
    await debuggerSend(tabId, 'Input.dispatchKeyEvent', {
        type: 'keyUp', modifiers: 0,
        key: 'Control', code: 'ControlLeft',
        windowsVirtualKeyCode: 17, nativeVirtualKeyCode: 17
    });
}

async function readDocsSelectionViaDebugger(tabId) {
    // 1. Snapshot the current clipboard so we can put it back afterward.
    let savedClipboard = '';
    try {
        savedClipboard = await getReadableTextFromTab(tabId, 'readClipboardText');
    } catch (error) {
        console.warn('[XTTS] Could not snapshot clipboard before copy:', error);
    }

    await attachDebugger(tabId);
    try {
        // 2. Send a real Ctrl+C so Docs writes the selection to the clipboard.
        await sendCopyKeystroke(tabId);
        // Give Docs a moment to populate the system clipboard.
        await delay(250);
        // 3. Read the selection back off the clipboard.
        const selected = await getReadableTextFromTab(tabId, 'readClipboardText');
        // 4. Restore the user's original clipboard contents.
        try {
            await messageTab(tabId, { action: 'writeClipboardText', text: savedClipboard });
        } catch (error) {
            console.warn('[XTTS] Could not restore original clipboard:', error);
        }
        return selected;
    } finally {
        await detachDebugger(tabId);
    }
}

// Orchestrates the popup Play button: Google Docs uses the debugger copy,
// everything else reads the live DOM selection.
async function handlePlayFromPopup() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab || !tab.id) {
        return { ok: false, error: 'No active tab found.' };
    }

    let text = '';
    if (isGoogleDocsUrl(tab.url)) {
        text = await readDocsSelectionViaDebugger(tab.id);
    } else {
        text = await getReadableTextFromTab(tab.id, 'getReadableText');
    }

    text = (text || '').trim();
    if (!text) {
        return { ok: false, error: 'No selected text found. Highlight some text and try again.' };
    }

    readAloudText(text);
    return { ok: true };
}

// Context menu click handler
chrome.contextMenus.onClicked.addListener(function(info, tab) {
    if (info.menuItemId === "readAloud" && info.selectionText) {
        readAloudText(info.selectionText);
    } else if (info.menuItemId === "readAloudDocs") {
        if (!tab || !tab.id) {
            console.error('[XTTS] No tab available for Google Docs read-aloud.');
            return;
        }
        getReadableTextFromTab(tab.id, 'readClipboardText')
            .then(text => {
                if (text && text.trim()) {
                    readAloudText(text);
                } else {
                    console.warn('[XTTS] No copied text found. In Google Docs, select text and press Ctrl+C first, then choose "Read Aloud (copied text)".');
                }
            })
            .catch(error => console.error('[XTTS] Failed to read clipboard for Google Docs:', error));
    }
});

// Messages from the popup.
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (message && message.action === 'readAloudText' && message.text) {
        readAloudText(message.text);
        sendResponse({ ok: true });
        return; // synchronous
    }

    if (message && message.action === 'playFromPopup') {
        handlePlayFromPopup()
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ ok: false, error: String(error && error.message ? error.message : error) }));
        return true; // async response
    }
});

// Keyboard shortcut (Ctrl+Shift+S). Works everywhere, including Google Docs,
// where it falls back to the clipboard because there is no DOM selection.
chrome.commands.onCommand.addListener(function(command) {
    if (command !== 'play-selected-text') {
        return;
    }
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        const tab = tabs[0];
        if (!tab || !tab.id) {
            console.error('[XTTS] No active tab for keyboard shortcut.');
            return;
        }
        getReadableTextFromTab(tab.id, 'getReadableText')
            .then(text => {
                if (text && text.trim()) {
                    readAloudText(text);
                } else {
                    console.warn('[XTTS] Nothing selected. In Google Docs, copy text with Ctrl+C first, then press Ctrl+Shift+S.');
                }
            })
            .catch(error => console.error('[XTTS] Failed to get text for keyboard shortcut:', error));
    });
});

// Function for additional text preprocessing
function preprocessAdvancedText(text) {
    if (!text) return '';
    
    // Replace common abbreviations with full forms for better speech
    const abbreviations = {
        'Dr.': 'Doctor',
        'Mr.': 'Mister',
        'Mrs.': 'Misses',
        'Ms.': 'Miss',
        'Prof.': 'Professor',
        'etc.': 'etcetera',
        'i.e.': 'that is',
        'e.g.': 'for example'
    };
    
    let processedText = text;
    
    // Replace abbreviations with their full forms
    Object.entries(abbreviations).forEach(([abbr, full]) => {
        const regex = new RegExp(`\\b${abbr.replace('.', '\\.')}\\b`, 'g');
        processedText = processedText.replace(regex, full);
    });
    
    // Handle parentheses - instead of removing them, we'll keep the content
    // But add slight pauses with commas to make speech more natural
    processedText = processedText.replace(/\(([^)]+)\)/g, ', $1, ');
    
    // Handle special characters and numbers
    processedText = processedText
        // Convert URLs to more speakable format
        .replace(/(https?:\/\/[^\s]+)/g, 'URL')
        // Remove excessive spaces
        .replace(/\s+/g, ' ')
        // Add pause after periods that aren't part of known abbreviations
        .replace(/(\.)(\s+|$)(?!com|org|net|gov|edu)/g, '$1, $2')
        // Add pause after question marks and exclamation points
        .replace(/([?!])(\s+|$)/g, '$1, $2');
    
    return processedText.trim();
}

// Function to send text to XTTS API and retrieve audio blob
function fetchAudio(text, voiceId, serverIp) {
    // Read connection mode from storage, then fetch audio
    chrome.storage.local.get(['connectionMode', 'relayUrl'], function(settings) {
        const connectionMode = settings.connectionMode || 'relay';
        const relayUrl = (settings.relayUrl || DEFAULT_RELAY_URL).replace(/\/+$/, '');

        let apiUrl, bodyPayload;

        if (connectionMode === 'relay') {
            apiUrl = `${relayUrl}/api/tts/synthesize`;
            bodyPayload = {
                text: text,
                voiceId: voiceId,
                language: "en"
            };
        } else {
            apiUrl = `http://${serverIp}:8020/tts_to_audio/`;
            bodyPayload = {
                text: text,
                speaker_wav: voiceId,
                language: "en"
            };
        }

        console.log(`[XTTS] Sending ${connectionMode} request to ${apiUrl}`);

        fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(bodyPayload),
            ...buildRelayFetchOptions(connectionMode)
        })
        .then(response => {
            console.log(`[XTTS] Response received: status=${response.status} ${response.statusText}, content-type=${response.headers.get('content-type')}`);
            ensureRelayAuthenticated(response, relayUrl);
            if (!response.ok) {
                throw new Error('Failed to fetch audio: ' + response.statusText);
            }
            return response.blob();
        })
        .then(blob => {
            console.log(`[XTTS] Response body read as blob: type="${blob.type}", size=${blob.size} bytes`);
            if (blob.size === 0) {
                throw new Error('Relay returned an empty response body');
            }
            if (blob.type && !blob.type.startsWith('audio/')) {
                // The relay handed back something that is not audio (often JSON
                // or an HTML error/sign-in page). Surface the payload so we can
                // see what it actually sent instead of silently failing playback.
                return blob.text().then(text => {
                    throw new Error(
                        `Expected audio but relay returned "${blob.type}". First 300 chars: ${text.slice(0, 300)}`
                    );
                });
            }
            return blobToDataUrl(blob);
        })
        .then(audioUrl => {
            console.log(`[XTTS] Audio converted to data URL (${audioUrl.length} chars), handing off to player`);
            return playAudio(audioUrl);
        })
        .then(() => {
            console.log('[XTTS] Playback started successfully');
        })
        .catch(error => {
            console.error('[XTTS] Error fetching/playing audio:', error);
        });
    });
}
