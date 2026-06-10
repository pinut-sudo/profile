// V-Pop Track Data List
// Track Data List from Config
const TRACKS = (window.CONFIG && window.CONFIG.tracks) ? window.CONFIG.tracks : [];

// Pre-generate a static waveform representation for each song to make it look like its real waveform profile
const WAVEFORMS = TRACKS.map((track, trackIndex) => {
    const bars = 60;
    const heights = [];
    // Use a simple deterministic generator based on the track title length and chars
    let seed = track.title.length + trackIndex * 7;
    for (let i = 0; i < bars; i++) {
        // pseudo-random number between 0.15 and 0.9
        seed = (seed * 9301 + 49297) % 233280;
        const rand = seed / 233280;
        // Make it symmetric or shape it like a sound wave (bell curve approximation)
        const centerDist = Math.abs(i - bars / 2) / (bars / 2); // 0 at center, 1 at edges
        const envelope = Math.max(0.15, 1 - centerDist * centerDist); // bell curve
        heights.push((0.25 + rand * 0.75) * envelope);
    }
    return heights;
});

// DOM Elements
const slides = document.querySelectorAll(".carousel-slide");
const metaPanel = document.getElementById("meta-panel");
const metaTitle = document.getElementById("meta-title");
const btnLaunch = document.getElementById("btn-launch");

// Audio Deck Elements
const trackArtistBottom = document.getElementById("track-artist-bottom");
const progressBar = document.getElementById("progress-bar");
const progressContainer = document.getElementById("progress-container");
const progressHandle = document.getElementById("progress-handle");
const timeCurrent = document.getElementById("time-current");
const timeDuration = document.getElementById("time-duration");
const thumbButtons = document.querySelectorAll(".thumb-btn");

// Canvas Elements
const visualizerCanvas = document.getElementById("audio-visualizer");
const visualizerCtx = visualizerCanvas.getContext("2d");
const particleCanvas = document.getElementById("bg-particles");
const particleCtx = particleCanvas.getContext("2d");
const timelineCanvas = document.getElementById("timeline-visualizer");
const timelineCtx = timelineCanvas ? timelineCanvas.getContext("2d") : null;

// Volume Controls DOM Elements
const volumeBtn = document.getElementById("volume-btn");
const volumeIcon = document.getElementById("volume-icon");
const volumeSliderContainer = document.getElementById("volume-slider-container");
const volumeBar = document.getElementById("volume-bar");
const volumeHandle = document.getElementById("volume-handle");

// Apply dynamic configuration values
function applyConfig() {
    if (!window.CONFIG) return;
    
    // Brand Logo
    const brandLogo = document.querySelector(".brand-logo");
    if (brandLogo && window.CONFIG.brandName) {
        brandLogo.textContent = window.CONFIG.brandName;
    }
    
    // Social links
    const fbLink = document.getElementById("nav-fb");
    if (fbLink && window.CONFIG.socials.facebook) fbLink.href = window.CONFIG.socials.facebook;
    const tiktokLink = document.getElementById("nav-tiktok");
    if (tiktokLink && window.CONFIG.socials.tiktok) tiktokLink.href = window.CONFIG.socials.tiktok;
    const discordLink = document.getElementById("nav-discord");
    if (discordLink && window.CONFIG.socials.discord) discordLink.href = window.CONFIG.socials.discord;
    const igLink = document.getElementById("nav-ig");
    if (igLink && window.CONFIG.socials.instagram) igLink.href = window.CONFIG.socials.instagram;

    // Sync slides content from config
    slides.forEach((slide, i) => {
        const img = slide.querySelector(".slide-img");
        if (img && TRACKS[i]) {
            img.src = TRACKS[i].image;
            img.alt = TRACKS[i].title;
        }
    });

    // Sync thumbnails content from config
    thumbButtons.forEach((btn, i) => {
        const img = btn.querySelector("img");
        if (img && TRACKS[i]) {
            img.src = TRACKS[i].image;
            img.alt = TRACKS[i].title;
        }
    });
}
applyConfig();

// State Variables
let activeIndex = 0;
let isDragging = false;
let startX = 0;
let currentVolume = 0.8; // Default volume (80%)
let isVolumeDragging = false;
let isMuted = false;
let preMuteVolume = 0.8;

// Audio Object
const audio = new Audio();
audio.src = TRACKS[activeIndex].src;
audio.volume = currentVolume;

// Web Audio API
let audioCtx = null;
let analyser = null;
let audioSource = null;
let dataArray = [];
let animationFrameId = null;

// Particle Background variables
let particles = [];
const PARTICLE_COUNT = 50;

// Resize Handler
function resize() {
    particleCanvas.width = window.innerWidth;
    particleCanvas.height = window.innerHeight;
    
    const visSize = Math.min(700, window.innerWidth - 20);
    visualizerCanvas.width = visSize;
    visualizerCanvas.height = visSize;

    if (timelineCanvas && progressContainer) {
        timelineCanvas.width = progressContainer.clientWidth || 300;
        timelineCanvas.height = progressContainer.clientHeight || 38;
    }
}
window.addEventListener("resize", resize);
resize();

/* --- Particle System --- */
class Particle {
    constructor() {
        this.reset();
    }
    reset() {
        this.x = Math.random() * particleCanvas.width;
        this.y = Math.random() * particleCanvas.height;
        this.size = Math.random() * 1.8 + 0.3;
        this.speedX = (Math.random() - 0.5) * 0.15;
        this.speedY = -Math.random() * 0.3 - 0.05;
        this.alpha = Math.random() * 0.4 + 0.1;
    }
    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        if (this.y < 0) {
            this.y = particleCanvas.height;
            this.x = Math.random() * particleCanvas.width;
        }
    }
    draw() {
        particleCtx.save();
        particleCtx.globalAlpha = this.alpha;
        particleCtx.fillStyle = TRACKS[activeIndex].color;
        particleCtx.beginPath();
        particleCtx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        particleCtx.fill();
        particleCtx.restore();
    }
}

for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push(new Particle());
}

function renderTimelineWave() {
    if (!timelineCanvas || !timelineCtx) return;
    const w = timelineCanvas.width;
    const h = timelineCanvas.height;
    timelineCtx.clearRect(0, 0, w, h);

    const trackWave = WAVEFORMS[activeIndex];
    if (!trackWave) return;
    const numBars = trackWave.length;
    const barSpacing = w / numBars;
    const barWidth = Math.max(1.5, barSpacing - 2);

    // Current play progress percentage
    const progress = audio.duration ? (audio.currentTime / audio.duration) : 0;
    const activeColor = TRACKS[activeIndex].color;

    // Get live frequency data if available to bounce the wave slightly
    let freqData = null;
    if (analyser && !audio.paused) {
        freqData = dataArray;
    }

    for (let i = 0; i < numBars; i++) {
        // Base ratio of the bar (0 to 1)
        let ratio = trackWave[i];

        // If audio is playing, add a dynamic bounce based on live frequency data
        if (freqData) {
            const freqBin = Math.floor((i / numBars) * freqData.length * 0.5);
            const freqValue = freqData[freqBin] / 255;
            ratio = (ratio * 0.4) + (freqValue * 0.6);
        }

        const barHeight = Math.max(4, ratio * h * 0.75);
        const x = i * barSpacing + (barSpacing - barWidth) / 2;
        const y = (h - barHeight) / 2;

        timelineCtx.beginPath();
        if (timelineCtx.roundRect) {
            timelineCtx.roundRect(x, y, barWidth, barHeight, barWidth / 2);
        } else {
            timelineCtx.rect(x, y, barWidth, barHeight);
        }

        const barProgress = i / numBars;
        if (barProgress <= progress) {
            timelineCtx.fillStyle = activeColor;
            timelineCtx.globalAlpha = 0.85;
        } else {
            timelineCtx.fillStyle = "#ffffff";
            timelineCtx.globalAlpha = 0.18;
        }
        timelineCtx.fill();
    }
    timelineCtx.globalAlpha = 1.0;
}

function animateParticles() {
    particleCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
    particles.forEach(p => {
        p.update();
        p.draw();
    });
    renderTimelineWave();
    requestAnimationFrame(animateParticles);
}
animateParticles();

/* --- Cylinder Carousel Logic --- */
function updateCarousel() {
    const total = TRACKS.length;
    
    // Assign Cylinder skews based on index relative to activeIndex
    slides.forEach(slide => {
        const index = parseInt(slide.getAttribute("data-index"));
        
        let diff = index - activeIndex;
        // Wrap diff into range [-1, 2]
        while (diff > 2) diff -= total;
        while (diff <= -2) diff += total;

        // Reset slide classes
        slide.className = "carousel-slide";
        
        if (diff === 0) {
            slide.classList.add("center");
        } else if (diff === 1) {
            slide.classList.add("right");
        } else if (diff === -1) {
            slide.classList.add("left");
        } else {
            // hidden slide wraps depending on direction
            if (diff === 2) {
                slide.classList.add("hidden-right");
            } else {
                slide.classList.add("hidden-left");
            }
        }
    });

    // Animate Card Info Panel (fade and slide)
    metaPanel.style.opacity = 0;
    metaPanel.style.transform = 'translateY(15px)';

    setTimeout(() => {
        const track = TRACKS[activeIndex];
        metaTitle.textContent = track.title;
        trackArtistBottom.textContent = track.artist;
        
        // Update custom CSS color variables globally
        document.documentElement.style.setProperty('--color-lime', track.color);
        
        metaPanel.style.opacity = 1;
        metaPanel.style.transform = 'translateY(0)';
    }, 250);

    // Sync Thumbnails Active State
    thumbButtons.forEach((btn, index) => {
        if (index === activeIndex) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });

    // Update audio track source
    const wasPlaying = !audio.paused;
    audio.src = TRACKS[activeIndex].src;
    audio.load();

    if (wasPlaying) {
        audio.play().catch(err => console.log("Audio deferred: " + err));
    }

    progressBar.style.width = '0%';
    progressHandle.style.left = '0%';
}

// Rotation functions
function rotateNext() {
    activeIndex = (activeIndex + 1) % TRACKS.length;
    updateCarousel();
}

function rotatePrev() {
    activeIndex = (activeIndex - 1 + TRACKS.length) % TRACKS.length;
    updateCarousel();
}

// Thumbnail indicator clicks
thumbButtons.forEach(btn => {
    btn.addEventListener("click", () => {
        const index = parseInt(btn.getAttribute("data-index"));
        if (index !== activeIndex) {
            activeIndex = index;
            updateCarousel();
        }
    });
});

// Click left/right slide directly to rotate
slides.forEach(slide => {
    slide.addEventListener("click", () => {
        if (slide.classList.contains("left")) {
            rotatePrev();
        } else if (slide.classList.contains("right")) {
            rotateNext();
        }
    });
});

/* --- Drag / Swipe Support --- */
const stage = document.getElementById("carousel-stage");
stage.addEventListener("mousedown", dragStart);
stage.addEventListener("touchstart", dragStart, { passive: true });

function dragStart(e) {
    isDragging = true;
    startX = e.type === "mousedown" ? e.pageX : e.touches[0].pageX;
    
    window.addEventListener("mousemove", dragMove);
    window.addEventListener("touchmove", dragMove, { passive: true });
    window.addEventListener("mouseup", dragEnd);
    window.addEventListener("touchend", dragEnd);
}

function dragMove(e) {
    if (!isDragging) return;
}

function dragEnd(e) {
    if (!isDragging) return;
    isDragging = false;
    
    const endX = e.type === "mouseup" ? e.pageX : e.changedTouches[0].pageX;
    const diff = endX - startX;
    
    // Snapping sensitivity (swipe at least 50px)
    if (Math.abs(diff) > 50) {
        if (diff > 0) {
            rotatePrev();
        } else {
            rotateNext();
        }
    }
    
    window.removeEventListener("mousemove", dragMove);
    window.removeEventListener("touchmove", dragMove);
    window.removeEventListener("mouseup", dragEnd);
    window.removeEventListener("touchend", dragEnd);
}

/* --- Audio Playback Engine --- */
function setupAudioEngine() {
    // Play/Pause Deck Buttons
    btnLaunch.addEventListener("click", togglePlayback);

    function togglePlayback() {
        initAudioContext();
        if (audio.paused) {
            audio.play().then(() => {
                updatePlayPauseState(true);
            }).catch(e => console.log("Play failed: " + e));
        } else {
            audio.pause();
            updatePlayPauseState(false);
        }
    }

    // Sync timeline progress
    audio.addEventListener("timeupdate", () => {
        if (audio.duration) {
            const percent = (audio.currentTime / audio.duration) * 100;
            progressBar.style.width = `${percent}%`;
            progressHandle.style.left = `${percent}%`;
            timeCurrent.textContent = formatTime(audio.currentTime);
            timeDuration.textContent = formatTime(audio.duration);
        }
    });

    audio.addEventListener("loadedmetadata", () => {
        timeDuration.textContent = formatTime(audio.duration);
    });

    // Seek & Scrub Timeline support
    let isScrubbing = false;
    let wasPlayingBeforeScrub = false;

    progressContainer.addEventListener("mousedown", (e) => {
        if (isNaN(audio.duration) || !isFinite(audio.duration) || audio.duration === 0) return;
        isScrubbing = true;
        wasPlayingBeforeScrub = !audio.paused;
        audio.pause();
        seek(e);
    });

    window.addEventListener("mousemove", (e) => {
        if (isScrubbing) {
            seek(e);
        }
    });

    window.addEventListener("mouseup", () => {
        if (isScrubbing) {
            isScrubbing = false;
            if (wasPlayingBeforeScrub) {
                audio.play().then(() => {
                    updatePlayPauseState(true);
                }).catch(err => console.log("Play failed after scrub: " + err));
            }
        }
    });

    // Touch support
    progressContainer.addEventListener("touchstart", (e) => {
        if (isNaN(audio.duration) || !isFinite(audio.duration) || audio.duration === 0) return;
        isScrubbing = true;
        wasPlayingBeforeScrub = !audio.paused;
        audio.pause();
        seek(e.touches[0]);
    }, { passive: true });

    window.addEventListener("touchmove", (e) => {
        if (isScrubbing) {
            seek(e.touches[0]);
        }
    }, { passive: true });

    window.addEventListener("touchend", () => {
        if (isScrubbing) {
            isScrubbing = false;
            if (wasPlayingBeforeScrub) {
                audio.play().then(() => {
                    updatePlayPauseState(true);
                }).catch(err => console.log("Play failed after scrub: " + err));
            }
        }
    });

    function seek(e) {
        if (isNaN(audio.duration) || !isFinite(audio.duration) || audio.duration === 0) return;
        const rect = progressContainer.getBoundingClientRect();
        const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const clickPercent = clickX / rect.width;
        
        // Update audio currentTime directly
        audio.currentTime = clickPercent * audio.duration;
        
        // Instant visual feedback during scrubbing
        const percent = clickPercent * 100;
        progressBar.style.width = `${percent}%`;
        progressHandle.style.left = `${percent}%`;
        timeCurrent.textContent = formatTime(audio.currentTime);
    }

    // Autoplay Next song when ended
    audio.addEventListener("ended", rotateNext);

    // Volume Adjustment & Drag support
    if (volumeSliderContainer && volumeBtn && volumeBar && volumeHandle) {
        volumeSliderContainer.addEventListener("mousedown", (e) => {
            isVolumeDragging = true;
            setVolumeFromEvent(e);
        });

        window.addEventListener("mousemove", (e) => {
            if (isVolumeDragging) {
                setVolumeFromEvent(e);
            }
        });

        window.addEventListener("mouseup", () => {
            if (isVolumeDragging) {
                isVolumeDragging = false;
            }
        });

        // Touch support for volume
        volumeSliderContainer.addEventListener("touchstart", (e) => {
            isVolumeDragging = true;
            setVolumeFromEvent(e.touches[0]);
        }, { passive: true });

        window.addEventListener("touchmove", (e) => {
            if (isVolumeDragging) {
                setVolumeFromEvent(e.touches[0]);
            }
        }, { passive: true });

        window.addEventListener("touchend", () => {
            if (isVolumeDragging) {
                isVolumeDragging = false;
            }
        });

        volumeBtn.addEventListener("click", () => {
            if (isMuted) {
                isMuted = false;
                updateVolume(preMuteVolume);
            } else {
                isMuted = true;
                preMuteVolume = currentVolume > 0 ? currentVolume : 0.8;
                updateVolume(0);
            }
        });

        // Initialize UI display for default volume
        updateVolume(currentVolume);
    }

    function setVolumeFromEvent(e) {
        const rect = volumeSliderContainer.getBoundingClientRect();
        const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const percent = clickX / rect.width;
        updateVolume(percent);
    }

    function updateVolume(percent) {
        currentVolume = percent;
        audio.volume = percent;
        if (percent > 0) {
            isMuted = false;
        }
        
        // Update UI fills
        const percentVal = percent * 100;
        volumeBar.style.width = `${percentVal}%`;
        volumeHandle.style.left = `${percentVal}%`;
        
        // Dynamic speaker icon path matching level
        if (percent === 0) {
            volumeIcon.innerHTML = `<path fill="currentColor" d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.21.05-.42.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>`;
        } else if (percent < 0.5) {
            volumeIcon.innerHTML = `<path fill="currentColor" d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>`;
        } else {
            volumeIcon.innerHTML = `<path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>`;
        }
    }
}

function updatePlayPauseState(isPlaying) {
    if (isPlaying) {
        btnLaunch.textContent = "PAUSE TRACK";
    } else {
        btnLaunch.textContent = "PLAY TRACK";
    }
}

function formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

/* --- Visualizer Canvas Rendering --- */
function initAudioContext() {
    if (audioCtx) return;

    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;

        audioSource = audioCtx.createMediaElementSource(audio);
        audioSource.connect(analyser);
        analyser.connect(audioCtx.destination);

        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);

        renderVisualizer();
    } catch (e) {
        console.error("Web Audio failed: ", e);
    }
}

function renderVisualizer() {
    animationFrameId = requestAnimationFrame(renderVisualizer);

    const w = visualizerCanvas.width;
    const h = visualizerCanvas.height;
    visualizerCtx.clearRect(0, 0, w, h);

    if (!analyser) return;

    analyser.getByteFrequencyData(dataArray);

    const cx = w / 2;
    const cy = h / 2;
    const isDesktop = window.innerWidth >= 900;
    
    // Radial visualizer ring backing the center slide card
    const innerRadius = isDesktop ? 270 : 190;
    const bufferLength = analyser.frequencyBinCount;
    const activeColor = TRACKS[activeIndex].color;

    // Glowing circle halo backing aura
    visualizerCtx.beginPath();
    visualizerCtx.arc(cx, cy, innerRadius - 15, 0, Math.PI * 2);
    visualizerCtx.strokeStyle = `${activeColor}15`;
    visualizerCtx.lineWidth = 18;
    visualizerCtx.stroke();

    for (let i = 0; i < bufferLength; i++) {
        const percent = dataArray[i] / 255;
        if (i > bufferLength * 0.85 && percent < 0.05) continue;

        // Radiating angle
        const angle = (i / (bufferLength * 0.85)) * Math.PI * 2;
        const barLength = percent * 80;

        const x1 = cx + Math.cos(angle) * innerRadius;
        const y1 = cy + Math.sin(angle) * innerRadius;
        const x2 = cx + Math.cos(angle) * (innerRadius + barLength);
        const y2 = cy + Math.sin(angle) * (innerRadius + barLength);

        visualizerCtx.beginPath();
        visualizerCtx.moveTo(x1, y1);
        visualizerCtx.lineTo(x2, y2);

        visualizerCtx.strokeStyle = activeColor;
        visualizerCtx.globalAlpha = 0.3 + percent * 0.7;
        visualizerCtx.lineWidth = isDesktop ? 3.5 : 2;
        visualizerCtx.lineCap = "round";
        visualizerCtx.stroke();
    }
    visualizerCtx.globalAlpha = 1.0;
}

// Initialise
setupAudioEngine();
updateCarousel();
