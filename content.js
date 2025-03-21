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
        const audio = new Audio(message.audioUrl);
        
        // Set playback speed
        if (message.speed) {
            audio.playbackRate = message.speed;
        }
        
        // Add event listener to revoke the URL when audio is done playing
        audio.addEventListener('ended', function() {
            URL.revokeObjectURL(message.audioUrl);
        });
        
        // Handle errors
        audio.addEventListener('error', function(e) {
            console.error('Error playing audio:', e);
            URL.revokeObjectURL(message.audioUrl);
        });
        
        // Play the audio
        audio.play().catch(error => {
            console.error('Error starting audio playback:', error);
        });
        
        return true; // Keep the message channel open for asynchronous response
    }
});
