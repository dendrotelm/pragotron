// Prosty menedżer dźwięku
class SoundManager {
    constructor() {
        this.ambience = new Audio('/sounds/ambience.mp3'); // Pusty dworzec, wiatr
        this.ambience.loop = true;
        this.flapSound = new Audio('/sounds/flap_single.mp3'); // Kliknięcie klapki
        this.glitchMinor = new Audio('/sounds/glitch_minor.mp3'); // Krótki szum
        this.glitchMajor = new Audio('/sounds/glitch_major.mp3'); // Głębsze dudnienie
        this.click = new Audio('/sounds/click.mp3'); // Dźwięk przycisku
    }

    playBackgroundAmbience() {
        // this.ambience.play(); // Wymaga interakcji użytkownika najpierw
    }

    playFlap() {
        this.flapSound.cloneNode().play(); // Klonujemy, by móc grać wiele naraz
    }

    playAnomalySound(type) {
        if(type === 'glitch_minor') this.glitchMinor.play();
        if(type === 'glitch_major') this.glitchMajor.play();
        // level_up, etc.
    }

    playClick() {
        this.click.play();
    }
}

export default SoundManager;
