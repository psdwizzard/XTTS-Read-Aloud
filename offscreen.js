let activeAudio = null;

function stopActiveAudio() {
    if (!activeAudio) {
        return;
    }

    activeAudio.pause();
    activeAudio.removeAttribute('src');
    activeAudio.load();
    activeAudio = null;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.target !== 'offscreen' || message.action !== 'playAudio') {
        return false;
    }

    stopActiveAudio();

    const audio = new Audio(message.audioUrl);
    activeAudio = audio;
    audio.playbackRate = message.speed || 1.0;

    const clearIfActive = () => {
        if (activeAudio === audio) {
            activeAudio = null;
        }
    };

    audio.addEventListener('ended', clearIfActive, { once: true });
    audio.addEventListener('error', clearIfActive, { once: true });

    audio.play()
        .then(() => sendResponse({ ok: true }))
        .catch(error => {
            clearIfActive();
            sendResponse({
                ok: false,
                error: error instanceof Error ? error.message : String(error)
            });
        });

    return true;
});
