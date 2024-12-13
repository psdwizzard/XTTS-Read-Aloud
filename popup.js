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
            alert('Failed to load voice sets: ' + error.message);
        });
}

function updateVoiceList(voices, voiceSets) {
    const voiceList = document.getElementById('voiceList');
    voiceList.innerHTML = ''; // Clear existing options

    const defaultOption = document.createElement('option');
    defaultOption.value = "";
    defaultOption.textContent = "-- Select a Voice or Set --";
    voiceList.appendChild(defaultOption);

    // Populate individual voices
    voices.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.voice_id;
        option.textContent = voice.name;
        option.dataset.type = 'voice';
        voiceList.appendChild(option);
    });

    // Populate sets
    voiceSets.forEach(set => {
        const option = document.createElement('option');
        option.value = `set:${set.name}`;
        option.textContent = `Set: ${capitalizeFirstLetter(set.name)}`;
        option.dataset.type = 'set';
        voiceList.appendChild(option);
    });
}

function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

function displayCurrentVoice() {
    chrome.storage.local.get(['selectedVoice', 'selectedSet', 'serverIp'], function(result) {
        const selectedVoiceId = result.selectedVoice || '';
        const selectedSetName = result.selectedSet || '';
        const serverIp = result.serverIp || 'localhost';

        if (selectedSetName) {
            document.getElementById('currentVoice').textContent = `Set: ${capitalizeFirstLetter(selectedSetName)}`;
        } else if (selectedVoiceId) {
            fetch(`http://${serverIp}:8020/speakers`)
                .then(response => response.json())
                .then(voices => {
                    const currentVoice = voices.find(v => v.voice_id === selectedVoiceId);
                    const currentVoiceName = currentVoice ? currentVoice.name : 'Unknown Voice';
                    document.getElementById('currentVoice').textContent = currentVoiceName;
                })
                .catch(error => {
                    console.error('Error fetching voices:', error);
                    document.getElementById('currentVoice').textContent = 'Error fetching voice';
                });
        } else {
            document.getElementById('currentVoice').textContent = 'No voice or set selected.';
        }
    });
}

function loadSelection(selectionValue, voiceSets) {
    if (selectionValue.startsWith('set:')) {
        const setName = selectionValue.split(':')[1];
        const set = voiceSets.find(s => s.name === setName);
        if (set && set.voices.length > 0) {
            chrome.storage.local.set({selectedSet: setName, selectedVoice: null}, function() {
                console.log(`Set "${setName}" selected.`);
                alert(`Set "${capitalizeFirstLetter(setName)}" selected. A random voice will be used for each clip.`);
                displayCurrentVoice();
            });
        } else {
            alert(`Set "${setName}" is empty or not found.`);
        }
    } else {
        // It's an individual voice
        chrome.storage.local.set({selectedVoice: selectionValue, selectedSet: null}, function() {
            console.log("Voice selection saved:", selectionValue);
            displayCurrentVoice();
        });
    }
}

document.getElementById('saveServerIp').addEventListener('click', function() {
    const serverIp = document.getElementById('serverIp').value;
    chrome.storage.local.set({serverIp: serverIp}, function() {
        console.log("Server IP saved:", serverIp);
        displayCurrentVoice();
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
            fetchVoiceSets(function(voiceSets) {
                updateVoiceList(voices, voiceSets);
            });
        })
        .catch(error => {
            console.error('Error fetching voices:', error);
            alert('Failed to load voices: ' + error.message);
        });
    });
});

document.getElementById('loadVoice').addEventListener('click', function() {
    const selectedValue = document.getElementById('voiceList').value;
    if (selectedValue === "") {
        alert("Please select a voice or set.");
        return;
    }
    fetchVoiceSets(function(voiceSets) {
        loadSelection(selectedValue, voiceSets);
    });
});

// Event listener to open create_playlist.html in a new window
document.getElementById('createNewList').addEventListener('click', function() {
    chrome.windows.create({
        url: chrome.runtime.getURL('create_playlist.html'),
        type: 'popup',
        width: 600, // Adjusted width (1.5 times the original 400px)
        height: 600
    });
});

document.addEventListener('DOMContentLoaded', function() {
    displayCurrentVoice();
    document.getElementById('refreshList').click();
});
