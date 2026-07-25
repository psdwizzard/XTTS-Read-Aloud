let activeAudio = null;

// Read the clipboard from within the page context. Google Docs paints its
// text on a <canvas>, so window.getSelection() is empty there; the only way
// to recover the user's selection is what they copied with Ctrl+C. The
// "clipboardRead" permission lets execCommand('paste') work without a direct
// user gesture, so this succeeds even when triggered from the context menu.
function readClipboardText() {
    const textarea = document.createElement('textarea');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';
    textarea.setAttribute('aria-hidden', 'true');
    document.body.appendChild(textarea);

    const previouslyFocused = document.activeElement;
    textarea.focus();

    let text = '';
    try {
        if (document.execCommand('paste')) {
            text = textarea.value;
        }
    } catch (error) {
        console.error('[XTTS] Clipboard read failed:', error);
    }

    document.body.removeChild(textarea);
    // Restore focus so we don't disrupt the page (e.g. the Docs editor).
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
    }

    return text;
}

// Write text back to the clipboard. Used to restore the user's original
// clipboard after we temporarily hijack it to grab the Google Docs selection.
// The "clipboardWrite" permission lets execCommand('copy') work without a gesture.
function writeClipboardText(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text || '';
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';
    textarea.setAttribute('aria-hidden', 'true');
    document.body.appendChild(textarea);

    const previouslyFocused = document.activeElement;
    textarea.focus();
    textarea.select();

    let ok = false;
    try {
        ok = document.execCommand('copy');
    } catch (error) {
        console.error('[XTTS] Clipboard write failed:', error);
    }

    document.body.removeChild(textarea);
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
    }

    return ok;
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (message.action === "readClipboardText") {
        // Used by the Google Docs context-menu item and the debugger-based
        // Play flow (to snapshot and later re-read the clipboard).
        sendResponse({ text: readClipboardText() });
        return; // synchronous response
    }

    if (message.action === "writeClipboardText") {
        // Restores the user's original clipboard after the debugger copy.
        sendResponse({ ok: writeClipboardText(message.text || '') });
        return; // synchronous response
    }

    if (message.action === "getReadableText") {
        // Used by the keyboard shortcut: prefer a real DOM selection, and fall
        // back to the clipboard (e.g. inside Google Docs) when there is none.
        const selection = window.getSelection().toString().trim();
        sendResponse({ text: selection || readClipboardText() });
        return; // synchronous response
    }

    if (message.action === "playAudio") {
        if (activeAudio) {
            activeAudio.pause();
            activeAudio = null;
        }

        const audio = new Audio(message.audioUrl);
        activeAudio = audio;
        
        // Set playback speed
        if (message.speed) {
            audio.playbackRate = message.speed;
        }
        
        // Clean up after playback finishes.
        audio.addEventListener('ended', function() {
            if (message.audioUrl.startsWith('blob:')) {
                URL.revokeObjectURL(message.audioUrl);
            }
            if (activeAudio === audio) {
                activeAudio = null;
            }
        });
        
        // Handle errors
        audio.addEventListener('error', function(e) {
            console.error('Error playing audio:', e);
            if (message.audioUrl.startsWith('blob:')) {
                URL.revokeObjectURL(message.audioUrl);
            }
            if (activeAudio === audio) {
                activeAudio = null;
            }
        });
        
        // Play the audio
        audio.play().catch(error => {
            console.error('Error starting audio playback:', error);
            if (activeAudio === audio) {
                activeAudio = null;
            }
        });
        
        return true; // Keep the message channel open for asynchronous response
    }
});
