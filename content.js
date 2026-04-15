let activeAudio = null;

// Function to send the selected text to the background script
function sendSelectedText() {
    const selectedText = window.getSelection().toString().trim();
    if (selectedText.length > 0) {
        chrome.runtime.sendMessage({
            action: "playText",
            text: selectedText
        });
    }
}

// Add an event listener for mouseup events (triggered after text selection)
document.addEventListener("mouseup", sendSelectedText);

// Optionally, add a listener for keyboard shortcuts (like pressing a key combination)
// Here is an example for Ctrl+Shift+S:
document.addEventListener("keydown", function (e) {
    if (e.ctrlKey && e.shiftKey && e.key === "S") {
        sendSelectedText();
    }
});

// Listen for messages from the background script
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
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
