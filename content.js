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
