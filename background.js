// This function preprocesses text to remove content within parentheses before sending to TTS
function preprocessText(text) {
    return text.replace(/\(.*?\)/g, '');
}

// This function sends text to your XTTS API and retrieves the audio blob
chrome.runtime.onInstalled.addListener(function() {
    chrome.contextMenus.create({
        id: "readAloud",
        title: "Read Aloud",
        contexts: ["selection"]
    });
});

chrome.contextMenus.onClicked.addListener(function(info, tab) {
    if (info.menuItemId === "readAloud" && info.selectionText) {
        chrome.storage.local.get(['selectedVoice', 'serverIp'], function(result) {
            const voiceId = result.selectedVoice || 'defaultVoiceId';
            const serverIp = result.serverIp || 'localhost';
            fetchAudio(info.selectionText, voiceId, serverIp);
        });
    }
});

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
        playAudio(blob);
    })
    .catch(error => {
        console.error('Error fetching audio:', error);
        alert('Failed to fetch audio: ' + error.message);
    });
}

function playAudio(blob) {
    const audio = new Audio(URL.createObjectURL(blob));
    audio.play();
}
