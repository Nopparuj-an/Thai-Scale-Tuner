const Application = function () {
  this.initA4();
  this.tuner = new Tuner(this.a4);
  this.notes = new Notes(".notes", this.tuner);
  this.meter = new Meter(".meter");
  this.frequencyBars = new FrequencyBars(".frequency-bars");
  this.update({
    name: "A",
    frequency: this.a4,
    octave: 4,
    value: 42,
    cents: 0,
  });
};

Application.prototype.initA4 = function () {
  this.$a4 = document.querySelector(".a4 span");
  this.a4 = parseFloat(localStorage.getItem("a4")) || 230.3;
  this.$a4.innerHTML = this.a4;
};

Application.prototype.start = function () {
  const self = this;

  this.tuner.onNoteDetected = function (note) {
    if (self.notes.isAutoMode) {
      if (self.lastNote === note.name) {
        self.update(note);
      } else {
        self.lastNote = note.name;
      }
    }
  };

  // If user is using Chrome, show manual start button
  if (navigator.userAgent.indexOf("Chrome") !== -1) {
    swal.fire("Press Ok to start.").then(function () {
      self.init();
    });
  }

  this.$a4.addEventListener("click", function () {
    swal
      .fire({
        input: "number",
        inputValue: self.a4,
        inputValidator: (value) => {
          if (!value || isNaN(value) || parseFloat(value) <= 0) {
            return "Please enter a valid number";
          }
        },
      })
      .then(function ({ value: a4 }) {
        a4 = parseFloat(a4);
        if (!a4 || a4 === self.a4) {
          return;
        }
        self.a4 = a4;
        self.$a4.innerHTML = a4;
        self.tuner.middleA = a4;
        self.notes.createNotes();
        self.update({
          name: "A",
          frequency: self.a4,
          octave: 4,
          value: 42,
          cents: 0,
        });
        localStorage.setItem("a4", a4);
      });
  });

  this.updateFrequencyBars();

  // Handle auto mode button
  document.querySelector(".auto input").addEventListener("change", () => {
    this.notes.toggleAutoMode();
  });

  // Handle microphone drop-down selection
  document.getElementById("microphone-select").addEventListener("change", function (event) {
    const selectedDeviceId = event.target.value;
    self.tuner.startRecord(selectedDeviceId);
  });

  // Handle microphone refresh
  document.getElementById("microphone-refresh").addEventListener("click", function () {
    self.tuner.listMicrophones();
    self.tuner.init();
  });
};

Application.prototype.updateFrequencyBars = function () {
  if (this.tuner.analyser) {
    this.tuner.analyser.getByteFrequencyData(this.frequencyData);
    this.frequencyBars.update(this.frequencyData);
  }
  requestAnimationFrame(this.updateFrequencyBars.bind(this));
};

Application.prototype.update = function (note) {
  this.notes.update(note);
  this.meter.update((note.cents / 50) * 45);
};

Application.prototype.init = function () {
  const self = this;

  // List available microphones
  this.tuner.listMicrophones();

  // Initialize tuner
  this.tuner.init();
  this.frequencyData = new Uint8Array(this.tuner.analyser.frequencyBinCount);
};

const app = new Application();
app.start();

window.onload = function () {
  // Start tuner automatically
  app.init();
};