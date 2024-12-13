// Function to preprocess text by removing parentheses but keeping the text inside
function preprocessText(text) {
    // Remove all parentheses but keep the text inside
    return text.replace(/[()]/g, '').trim();
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
            fetchVoiceSets(function(voiceSets) {
                if (result.selectedSet) {
                    fetchRandomVoiceFromSet(result.selectedSet, voiceSets)
                        .then(voiceId => {
                            fetchAudio(info.selectionText, voiceId, serverIp);
                        })
                        .catch(error => {
                            console.error('Error fetching random voice from set:', error);
                        });
                } else if (result.selectedVoice) {
                    fetchAudio(info.selectionText, result.selectedVoice, serverIp);
                } else {
                    console.error('No voice or set selected.');
                }
            });
        });
    }
});

// Function to send text to XTTS API and retrieve audio blob
function fetchAudio(text, voiceId, serverIp) {
    const apiUrl = `http://${serverIp}:8020/tts_to_audio/`;
    fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            text: preprocessText(text),
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
        const audio = new window.Audio(URL.createObjectURL(blob));
        audio.play();
    })
    .catch(error => {
        console.error('Error fetching audio:', error);
    });
}
