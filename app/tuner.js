const Tuner = function (a4) {
  this.middleA = a4 || 230.3;
  this.semitone = 42;
  this.bufferSize = 4096;
  this.noteStrings = [
    "ด",
    "ร",
    "ม",
    "ฟ",
    "ซ",
    "ล",
    "ท",
  ];

  this.initGetUserMedia();
};

Tuner.prototype.initGetUserMedia = function () {
  window.AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!window.AudioContext) {
    return alert("AudioContext not supported");
  }

  // Older browsers might not implement mediaDevices at all, so we set an empty object first
  if (navigator.mediaDevices === undefined) {
    navigator.mediaDevices = {};
  }

  // Some browsers partially implement mediaDevices. We can't just assign an object
  // with getUserMedia as it would overwrite existing properties.
  // Here, we will just add the getUserMedia property if it's missing.
  if (navigator.mediaDevices.getUserMedia === undefined) {
    navigator.mediaDevices.getUserMedia = function (constraints) {
      // First get ahold of the legacy getUserMedia, if present
      const getUserMedia =
        navigator.webkitGetUserMedia || navigator.mozGetUserMedia;

      // Some browsers just don't implement it - return a rejected promise with an error
      // to keep a consistent interface
      if (!getUserMedia) {
        alert("getUserMedia is not implemented in this browser");
      }

      // Otherwise, wrap the call to the old navigator.getUserMedia with a Promise
      return new Promise(function (resolve, reject) {
        getUserMedia.call(navigator, constraints, resolve, reject);
      });
    };
  }
};

Tuner.prototype.listMicrophones = function () {
  const selectElement = document.getElementById("microphone-select");

  // Remember the selected microphone, if exist
  const selectedDeviceId = selectElement ? selectElement.value : null;

  // Request microphone access first
  navigator.mediaDevices
    .getUserMedia({ audio: true }) // Request microphone access
    .then((stream) => {
      // Stop the stream immediately after access is granted
      stream.getTracks().forEach((track) => track.stop());

      // Now enumerate devices
      return navigator.mediaDevices.enumerateDevices();
    })
    .then((devices) => {
      const audioInputDevices = devices.filter((device) => device.kind === "audioinput");

      // Clear existing options
      selectElement.innerHTML = '<option value="">Select microphone</option>';

      // Populate the dropdown with available microphones
      audioInputDevices.forEach((device) => {
        const option = document.createElement("option");
        option.value = device.deviceId;
        option.textContent = device.label || `Microphone ${selectElement.length}`;
        selectElement.appendChild(option);
      });

      // Restore the selected microphone if exist, otherwise select the first one
      selectElement.value = selectedDeviceId || selectElement.children[1].value;
    });
};

Tuner.prototype.startRecord = function (deviceId) {
  const self = this;

  // Stop any existing stream before starting a new one
  if (self.stream) {
    self.stream.getTracks().forEach((track) => track.stop());
    self.stream = null;
  }

  const constraints = {
    audio: deviceId ? { deviceId: { exact: deviceId } } : true,
  };

  navigator.mediaDevices
    .getUserMedia(constraints)
    .then(function (stream) {
      self.stream = stream;
      self.source = self.audioContext.createMediaStreamSource(stream);

      // Create a MediaStream destination for audio routing
      const destination = self.audioContext.createMediaStreamDestination();
      self.source.connect(self.analyser);
      self.analyser.connect(self.scriptProcessor);
      self.scriptProcessor.connect(destination);

      // Create the monitor audio element
      self.monitorAudio = document.createElement("audio");
      self.monitorAudio.srcObject = destination.stream;
      self.monitorAudio.loop = true;
      self.monitorAudio.volume = 1.0;
      self.monitorAudio.muted = false;
      self.monitorAudio.autoplay = true;
      document.body.appendChild(self.monitorAudio);

      self.monitorAudio.play().catch((err) => console.error("Monitor audio playback error:", err));

      // Add the audioprocess handler
      self.audioProcessHandler = function (event) {
        const frequency = self.pitchDetector.do(
          event.inputBuffer.getChannelData(0)
        );
        if (frequency && self.onNoteDetected) {
          const note = self.getNote(frequency);
          self.onNoteDetected({
            name: self.noteStrings[note % 7],
            value: note,
            cents: self.getCents(frequency, note),
            octave: parseInt(note / 7) - 1,
            frequency: frequency,
          });
        }
      };
      self.scriptProcessor.addEventListener("audioprocess", self.audioProcessHandler);
    })
    .catch(function (error) {
      swal.fire({
        title: "Error, try again?",
        text: error.name + ": " + error.message,
        icon: "error",
      }).then(function () {
        app.init();
      });
    });
};

Tuner.prototype.stopMicrophone = function () {
  if (this.stream) {
    this.stream.getTracks().forEach(track => track.stop());
    this.stream = null;
  }
  if (this.scriptProcessor) {
    // Remove the same bound function
    this.scriptProcessor.removeEventListener("audioprocess", this.boundProcessAudio);
  }
};

Tuner.prototype.stopMonitor = function () {
  // Turn off the monitor if it was on
  if (this.monitorConnected) {
    this.source.disconnect(this.audioContext.destination);
    this.monitorConnected = false;
    document.getElementById("monitor-checkbox").checked = false;
  }
};

Tuner.prototype.init = function () {
  this.stopMonitor();

  // If audio context already exists, close it to release resources
  if (this.audioContext) {
    this.audioContext.close();
    this.audioContext = null;
  }

  // Reinitialize the audio context and nodes
  this.audioContext = new window.AudioContext();
  this.analyser = this.audioContext.createAnalyser();
  this.scriptProcessor = this.audioContext.createScriptProcessor(
    this.bufferSize,
    1,
    1
  );

  const self = this;

  aubio().then(function (aubio) {
    self.pitchDetector = new aubio.Pitch(
      "default",
      self.bufferSize,
      1,
      self.audioContext.sampleRate
    );

    // Check if a microphone is selected. If not, start recording with the default microphone.
    const selectElement = document.getElementById("microphone-select");
    const selectedDeviceId = selectElement.value;

    if (selectedDeviceId) {
      self.startRecord(selectedDeviceId);
    } else {
      self.startRecord();
    }
  });
};

/**
 * get musical note from frequency
 *
 * @param {number} frequency
 * @returns {number}
 */
Tuner.prototype.getNote = function (frequency) {
  const note = 7 * (Math.log(frequency / this.middleA) / Math.log(2));
  return Math.round(note) + this.semitone;
};

/**
 * get the musical note's standard frequency
 *
 * @param note
 * @returns {number}
 */
Tuner.prototype.getStandardFrequency = function (note) {
  return this.middleA * Math.pow(2, (note - this.semitone) / 7);
};

/**
 * get cents difference between given frequency and musical note's standard frequency
 *
 * @param {number} frequency
 * @param {number} note
 * @returns {number}
 */
Tuner.prototype.getCents = function (frequency, note) {
  return Math.floor(
    (1200 * Math.log(frequency / this.getStandardFrequency(note))) / Math.log(2) / (12 / 7)
  );
};

/**
 * play the musical note
 *
 * @param {number} frequency
 */
Tuner.prototype.play = function (frequency) {
  if (!this.oscillator) {
    this.oscillator = this.audioContext.createOscillator();
    this.oscillator.connect(this.audioContext.destination);
    this.oscillator.start();
  }
  this.oscillator.frequency.value = frequency;
};

Tuner.prototype.stopOscillator = function () {
  if (this.oscillator) {
    this.oscillator.stop();
    this.oscillator = null;
  }
};
