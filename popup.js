// Function to update the dropdown list with voices
function updateVoiceList(voices) {
    const voiceList = document.getElementById('voiceList');
    voiceList.innerHTML = ''; // Clear existing options
    voices.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.voice_id;
        option.textContent = voice.name;
        voiceList.appendChild(option);
    });
}

// Event listener for the Refresh List button
document.getElementById('saveServerIp').addEventListener('click', function() {
    const serverIp = document.getElementById('serverIp').value;
    chrome.storage.local.set({serverIp: serverIp}, function() {
        console.log("Server IP saved:", serverIp);
    });
});

document.getElementById('refreshList').addEventListener('click', function() {
    chrome.storage.local.get(['serverIp'], function(result) {
        const serverIp = result.serverIp || 'localhost';
        fetch(`http://${serverIp}:8020/speakers`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Cache-Control': 'no-cache'
            }
        })
        .then(response => response.json())
        .then(voices => {
            const voiceList = document.getElementById('voiceList');
            voiceList.innerHTML = ''; // Clear existing options
            voices.forEach(voice => {
                let option = document.createElement('option');
                option.value = voice.voice_id;
                option.text = voice.name;
                voiceList.appendChild(option);
            });
        })
        .catch(error => {
            console.error('Error fetching voices:', error);
            alert('Failed to load voices: ' + error.message);
        });
    });
});

document.getElementById('loadVoice').addEventListener('click', function() {
    const selectedVoice = document.getElementById('voiceList').value;
    chrome.storage.local.set({selectedVoice: selectedVoice}, function() {
        console.log("Voice selection saved:", selectedVoice);
    });
});
