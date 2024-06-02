# XTTS-Read-Aloud

This Chrome extension integrates screen reader functionality using the XTTS API Server. Currently in beta and using the XTTS API Server backend, it will soon move to AllTalk. It enhances web accessibility with seamless text-to-speech capabilities. Licensed under the MIT License for unrestricted and commercial use.

---

## Overview of Project

I use a screen reader every day for surfing the web and work. I hate how bad most voices are in screen readers, but I did not want to have a monthly subscription for a good screen reader. This extension currently works on the XTTS API Server backend, which cannot stream audio over the network as I had hoped. I wanted to deploy this on my network to use on all of my computers. I am in the process of moving this to AllTalk, but it is taking longer than expected.

---

## Demo Video

[![Video Thumbnail](https://img.youtube.com/vi/0qcrwc7Dfww/0.jpg)](https://www.youtube.com/watch?v=0qcrwc7Dfww)

---

## Installation

### Server Installation

This extension uses the [XTTS API Server](https://github.com/daswer123/xtts-api-server). You can find installation instructions [here](https://github.com/daswer123/xtts-api-server).

### Chrome Extension Installation Instructions

#### How to Install an Unpacked Chrome Extension

1. **Download or Clone the Extension Files:**
    Ensure you have all the extension files on your local machine. If you are using GitHub, you can either download the repository as a ZIP file and extract it, or clone the repository using Git.

2. **Open Chrome and Navigate to Extensions Page:**
    - Open Google Chrome.
    - Type `chrome://extensions/` in the address bar and press Enter.

3. **Enable Developer Mode:**
    - In the top right corner of the Extensions page, toggle the switch to enable "Developer mode".

4. **Load Unpacked Extension:**
    - Click on the "Load unpacked" button that appears.
    - In the file dialog that opens, navigate to the directory where your extension files are located, and select the folder.

5. **Verify Installation:**
    - Once the extension is loaded, you should see it listed on the Extensions page with its name and description.
    - You can now use the extension as you normally would.

---

## Setup

### After Installing XTTS API Server

- Put your audio clips into the speaker folder. The name you give the WAV file will be the name that shows up in the extension. For example, `Bob.wav` will show up as Bob.

### After Installing the Chrome Extension

1. Pin the extension to the top for easy access.
2. Click on it, and you will see the server IP field. You can enter `localhost` or the subnet IP address of your server (e.g., `192.168.1.100`).
3. Click "Save Server IP".
4. Click "Refresh list" to load all your voices.
5. Once you have selected your voice, click "Load Voice".

---

## Use

Highlight any text, right-click on it, and select "Read Aloud" Orange to have the highlighted text read aloud.

---

## Known Issues

1. It only plays audio on the PC it's running on, not through the browser (this is why I am moving to a new backend).
2. It has all the odd issues any audio played through XTTS would have.
3. Text in brackets "()" is skipped; I am working on this.
4. The UI needs improvement.

---

## Voices

I cannot release the voices in the demo due to copyright reasons. You will have to add your own. These clips need to be clean audio of at least 10 seconds, though most of mine are 30 seconds. I like to use Audacity to cut out large silent parts. Additionally, a well-finetuned XTTS2 model really helps.
