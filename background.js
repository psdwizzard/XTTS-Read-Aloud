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

// Context menu click handler
chrome.contextMenus.onClicked.addListener(function(info, tab) {
    if (info.menuItemId === "readAloud" && info.selectionText) {
        chrome.storage.local.get(['selectedVoice', 'selectedSet', 'serverIp'], function(result) {
            const serverIp = result.serverIp || 'localhost';
            
            // Get the preprocessed text with dictionary replacements applied
            chrome.storage.local.get(['dictionary'], function(dictResult) {
                const dictionary = dictResult.dictionary || {};
                let processedText = info.selectionText;
                
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
    const apiUrl = `http://${serverIp}:8020/tts_to_audio/`;
    
    fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            text: text,
            speaker_wav: voiceId,
            language: "en"
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to fetch audio: ' + response.statusText);
        }
        return response.blob();
    })
    .then(blob => {
        // Create a URL from the blob
        const audioUrl = URL.createObjectURL(blob);
        
        // Use chrome.tabs API to execute a content script that plays the audio
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const currentTabId = tabs[0]?.id;
            if (currentTabId) {
                chrome.tabs.sendMessage(currentTabId, {
                    action: "playAudio", 
                    audioUrl: audioUrl,
                    speed: 1.0
                });
            } else {
                console.error('No active tab found to play audio');
            }
        });
    })
    .catch(error => {
        console.error('Error fetching audio:', error);
    });
}
