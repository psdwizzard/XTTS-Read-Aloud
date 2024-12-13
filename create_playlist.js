// Function to refresh the list of available voices
function refreshVoicesList() {
    chrome.storage.local.get(['serverIp'], function(result) {
        const serverIp = result.serverIp || 'localhost'; // Default to localhost if no server IP is set
        fetch(`http://${serverIp}:8020/speakers`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Cache-Control': 'no-cache'
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Failed to fetch voices: ${response.statusText}`);
            }
            return response.json();
        })
        .then(voices => {
            const voicesContainer = document.getElementById('voicesContainer');
            voicesContainer.innerHTML = ''; // Clear any existing voices

            // Populate the container with checkboxes for each voice
            voices.forEach(voice => {
                const label = document.createElement('label');
                label.style.display = 'block';

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = voice.voice_id; // Use the voice ID as the value
                checkbox.dataset.name = voice.name; // Store the name for display

                label.appendChild(checkbox);
                label.appendChild(document.createTextNode(' ' + voice.name));
                voicesContainer.appendChild(label);
            });
        })
        .catch(error => {
            console.error('Error fetching voices:', error);
            alert('Failed to load voices. Please check the server connection.');
        });
    });
}

// Save the newly created playlist
document.getElementById('savePlaylist').addEventListener('click', function() {
    const playlistName = document.getElementById('playlistName').value.trim();
    if (!playlistName) {
        alert('Please enter a playlist name.');
        return;
    }

    const checkedVoices = [];
    const checkboxes = document.querySelectorAll('#voicesContainer input[type="checkbox"]:checked');
    checkboxes.forEach(cb => {
        checkedVoices.push({
            name: cb.dataset.name || 'Unknown', // Default to 'Unknown' if name is missing
            voice_id: cb.value
        });
    });

    if (checkedVoices.length === 0) {
        alert('Please select at least one voice.');
        return;
    }

    // Create a new playlist object
    const newSet = {
        type: "set",
        name: playlistName,
        voices: checkedVoices
    };

    // Save the playlist to local storage
    chrome.storage.local.get(['userSets'], function(result) {
        const userSets = result.userSets || [];
        const existingIndex = userSets.findIndex(s => s.name.toLowerCase() === playlistName.toLowerCase());
        if (existingIndex >= 0) {
            userSets.splice(existingIndex, 1); // Remove existing playlist with the same name
        }

        userSets.push(newSet); // Add the new playlist
        chrome.storage.local.set({userSets: userSets}, function() {
            alert(`Playlist "${playlistName}" saved successfully!`);
        });
    });
});

// Close the playlist creation window
document.getElementById('closeWindow').addEventListener('click', function() {
    window.close();
});

// Load the voices list when the page loads
document.addEventListener('DOMContentLoaded', refreshVoicesList);
