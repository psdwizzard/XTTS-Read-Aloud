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

// Tab switching functionality
function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons and contents
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            // Add active class to clicked button and corresponding content
            button.classList.add('active');
            const tabId = button.dataset.tab;
            document.getElementById(tabId).classList.add('active');
        });
    });
}

// Function to populate voice checkboxes in the playlist tab
function populateVoiceCheckboxes(voices) {
    const voiceCheckboxes = document.getElementById('voiceCheckboxes');
    voiceCheckboxes.innerHTML = ''; // Clear existing checkboxes
    
    if (voices.length === 0) {
        const noVoicesMsg = document.createElement('p');
        noVoicesMsg.textContent = 'No voices available. Please check server connection.';
        voiceCheckboxes.appendChild(noVoicesMsg);
        return;
    }
    
    // Add a checkbox for each voice
    voices.forEach(voice => {
        const checkboxItem = document.createElement('div');
        checkboxItem.className = 'voice-checkbox-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `voice-${voice.voice_id}`;
        checkbox.value = voice.voice_id;
        checkbox.dataset.name = voice.name;
        
        const label = document.createElement('label');
        label.htmlFor = `voice-${voice.voice_id}`;
        label.textContent = voice.name;
        
        checkboxItem.appendChild(checkbox);
        checkboxItem.appendChild(label);
        voiceCheckboxes.appendChild(checkboxItem);
    });
}

// Function to save a new playlist
function savePlaylist() {
    const playlistName = document.getElementById('playlistName').value.trim();
    
    if (!playlistName) {
        alert('Please enter a playlist name');
        return;
    }
    
    // Get all checked voices
    const checkedVoices = Array.from(document.querySelectorAll('#voiceCheckboxes input[type="checkbox"]:checked'))
        .map(checkbox => ({
            voice_id: checkbox.value,
            name: checkbox.dataset.name
        }));
    
    if (checkedVoices.length === 0) {
        alert('Please select at least one voice');
        return;
    }
    
    // Create the new set
    const newSet = {
        name: playlistName,
        voices: checkedVoices
    };
    
    // Add to existing user sets
    chrome.storage.local.get(['userSets'], function(result) {
        const userSets = result.userSets || [];
        
        // Check if a set with this name already exists
        const existingSetIndex = userSets.findIndex(set => set.name === playlistName);
        if (existingSetIndex !== -1) {
            // Replace the existing set
            userSets[existingSetIndex] = newSet;
        } else {
            // Add as a new set
            userSets.push(newSet);
        }
        
        // Save back to storage
        chrome.storage.local.set({userSets: userSets}, function() {
            alert(`Playlist "${playlistName}" saved successfully!`);
            document.getElementById('playlistName').value = '';
            
            // Uncheck all checkboxes
            document.querySelectorAll('#voiceCheckboxes input[type="checkbox"]')
                .forEach(checkbox => checkbox.checked = false);
            
            // Refresh the voice list in the server tab
            document.getElementById('refreshList').click();
        });
    });
}

// Dictionary functions
function loadDictionary() {
    chrome.storage.local.get(['dictionary'], function(result) {
        const dictionary = result.dictionary || {};
        updateDictionaryUI(dictionary);
    });
}

function updateDictionaryUI(dictionary) {
    const dictionaryEntries = document.getElementById('dictionaryEntries');
    dictionaryEntries.innerHTML = ''; // Clear existing entries
    
    if (Object.keys(dictionary).length === 0) {
        const noEntriesMsg = document.createElement('p');
        noEntriesMsg.textContent = 'No dictionary entries yet.';
        noEntriesMsg.style.padding = '8px';
        dictionaryEntries.appendChild(noEntriesMsg);
        return;
    }
    
    // Sort entries alphabetically by word
    const sortedEntries = Object.entries(dictionary).sort((a, b) => 
        a[0].toLowerCase().localeCompare(b[0].toLowerCase())
    );
    
    // Add each dictionary entry to the UI
    sortedEntries.forEach(([word, pronunciation]) => {
        const entryDiv = document.createElement('div');
        entryDiv.className = 'dictionary-entry';
        
        const wordSpan = document.createElement('span');
        wordSpan.className = 'entry-word';
        wordSpan.textContent = word;
        
        const pronunciationSpan = document.createElement('span');
        pronunciationSpan.className = 'entry-pronunciation';
        pronunciationSpan.textContent = pronunciation;
        
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'entry-actions';
        
        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.addEventListener('click', () => {
            deleteDictionaryEntry(word);
        });
        
        actionsDiv.appendChild(deleteButton);
        entryDiv.appendChild(wordSpan);
        entryDiv.appendChild(pronunciationSpan);
        entryDiv.appendChild(actionsDiv);
        
        dictionaryEntries.appendChild(entryDiv);
    });
}

function addDictionaryEntry() {
    const word = document.getElementById('dictionaryWord').value.trim();
    const pronunciation = document.getElementById('dictionaryPronunciation').value.trim();
    
    if (!word || !pronunciation) {
        alert('Please enter both a word and its pronunciation');
        return;
    }
    
    chrome.storage.local.get(['dictionary'], function(result) {
        const dictionary = result.dictionary || {};
        
        // Add or update the dictionary entry
        dictionary[word] = pronunciation;
        
        // Save back to storage
        chrome.storage.local.set({dictionary: dictionary}, function() {
            // Clear the input fields
            document.getElementById('dictionaryWord').value = '';
            document.getElementById('dictionaryPronunciation').value = '';
            
            // Update the UI
            updateDictionaryUI(dictionary);
        });
    });
}

function deleteDictionaryEntry(word) {
    chrome.storage.local.get(['dictionary'], function(result) {
        const dictionary = result.dictionary || {};
        
        if (dictionary[word]) {
            // Confirm deletion
            if (confirm(`Are you sure you want to delete the entry for "${word}"?`)) {
                // Remove the entry
                delete dictionary[word];
                
                // Save back to storage
                chrome.storage.local.set({dictionary: dictionary}, function() {
                    // Update the UI
                    updateDictionaryUI(dictionary);
                });
            }
        }
    });
}

// Theme toggle functionality
function toggleTheme() {
    document.body.dataset.theme = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
    
    // Save theme preference
    chrome.storage.local.set({theme: document.body.dataset.theme}, function() {
        console.log('Theme preference saved:', document.body.dataset.theme);
    });
}

// Load saved theme
function loadTheme() {
    chrome.storage.local.get(['theme'], function(result) {
        if (result.theme) {
            document.body.dataset.theme = result.theme;
        }
    });
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
        
        // Show loading indicator
        document.getElementById('currentVoice').textContent = 'Connecting to server...';
        
        // Setup timeout for the fetch operation
        const fetchPromise = fetch(`http://${serverIp}:8020/speakers`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });
        
        // Set a timeout of 5 seconds
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Connection timed out')), 5000)
        );
        
        // Race between fetch and timeout
        Promise.race([fetchPromise, timeoutPromise])
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Server returned ${response.status}: ${response.statusText}`);
                }
                return response.json();
            })
            .then(voices => {
                fetchVoiceSets(function(voiceSets) {
                    updateVoiceList(voices, voiceSets);
                    // Reset status message if it was showing connection status
                    displayCurrentVoice();
                });
            })
            .catch(error => {
                console.error('Error fetching voices:', error);
                document.getElementById('currentVoice').textContent = 
                    `Connection error: Please check if server is running at ${serverIp}:8020`;
                
                // Still populate the dropdown with sets even if server is unreachable
                fetchVoiceSets(function(voiceSets) {
                    // Just show sets without individual voices
                    updateVoiceList([], voiceSets);
                });
            });
    });
});

// Function to fetch voices for the playlist tab
function fetchVoicesForPlaylist() {
    chrome.storage.local.get(['serverIp'], function(result) {
        const serverIp = result.serverIp || 'localhost';
        
        // Setup timeout for the fetch operation
        const fetchPromise = fetch(`http://${serverIp}:8020/speakers`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });
        
        // Set a timeout of 5 seconds
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Connection timed out')), 5000)
        );
        
        // Race between fetch and timeout
        Promise.race([fetchPromise, timeoutPromise])
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Server returned ${response.status}: ${response.statusText}`);
                }
                return response.json();
            })
            .then(voices => {
                populateVoiceCheckboxes(voices);
            })
            .catch(error => {
                console.error('Error fetching voices for playlist:', error);
                populateVoiceCheckboxes([]); // Show empty state
            });
    });
}

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

// Add event listener for theme toggle
document.getElementById('toggleTheme').addEventListener('click', toggleTheme);

// Add event listener for the refresh voices button in playlist tab
document.getElementById('refreshVoices').addEventListener('click', fetchVoicesForPlaylist);

// Add event listener for the save playlist button
document.getElementById('savePlaylist').addEventListener('click', savePlaylist);

// Add event listener for the add to dictionary button
document.getElementById('addToDictionary').addEventListener('click', addDictionaryEntry);

document.addEventListener('DOMContentLoaded', function() {
    // Set up tabs
    setupTabs();
    
    // Initialize the interface
    displayCurrentVoice();
    document.getElementById('refreshList').click();
    
    // Populate the voice checkboxes in the playlist tab
    fetchVoicesForPlaylist();
    
    // Load dictionary entries
    loadDictionary();
    
    // Load saved server IP
    chrome.storage.local.get(['serverIp'], function(result) {
        if (result.serverIp) {
            document.getElementById('serverIp').value = result.serverIp;
        }
    });
    
    // Load saved theme
    loadTheme();
});
