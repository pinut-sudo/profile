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
// Enable CORS only for http/https hosting environments (prevents local file:// security errors)
if (window.location.protocol.startsWith("http")) {
    audio.crossOrigin = "anonymous";
}
audio.src = TRACKS[activeIndex].src;
audio.volume = currentVolume;

// Global playback state listeners to sync UI text automatically
audio.addEventListener("play", () => {
    updatePlayPauseState(true);
});
audio.addEventListener("playing", () => {
    updatePlayPauseState(true);
});
audio.addEventListener("pause", () => {
    updatePlayPauseState(false);
});

function startPlayback() {
    initAudioContext();
    if (audioCtx && audioCtx.state === "suspended") {
        audioCtx.resume();
    }
    audio.play().catch(err => {
        console.log("Playback deferred: ", err);
    });
}

// Web Audio API
let audioCtx = null;
let analyser = null;
let audioSource = null;
let dataArray = new Uint8Array(256); // Pre-initialize for immediate idle visualizer rendering
let animationFrameId = null;

// Particle Background variables
let particles = [];
const PARTICLE_COUNT = 120; // Increased density for galaxy effect

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

/* --- Particle System (Galaxy Spiral Starfield) --- */
class Particle {
    constructor() {
        this.reset(true);
    }
    reset(init = false) {
        const w = particleCanvas.width;
        const h = particleCanvas.height;
        const maxRadius = Math.max(w, h) * 0.75;
        
        // Spiral arms distribution (2 arms)
        this.radius = init ? Math.random() * maxRadius : maxRadius * (0.05 + Math.random() * 0.95);
        
        const armsCount = 2;
        const armIndex = Math.floor(Math.random() * armsCount);
        const armAngle = (armIndex * 2 * Math.PI) / armsCount;
        
        // Spiral math: angle increases with distance
        const spiralTwist = 2.0;
        const dispersion = (Math.random() - 0.5) * 0.55;
        this.angle = armAngle + (this.radius / maxRadius) * spiralTwist * Math.PI + dispersion;
        
        this.size = Math.random() * 1.6 + 0.3;
        // Near-center is faster, outer is slower
        this.speed = (Math.random() * 0.0006 + 0.0002) * (180 / (this.radius + 60));
        this.alpha = Math.random() * 0.5 + 0.15;
        this.twinkleSpeed = Math.random() * 0.015 + 0.005;
        this.twinkleFactor = Math.random() * Math.PI;
    }
    update() {
        let currentSpeed = this.speed;
        
        // Speed up on beat: works with real analyser AND file:// mock data
        if (!audio.paused && dataArray.length > 0) {
            let sum = 0;
            const bassBins = Math.min(10, dataArray.length);
            for (let i = 0; i < bassBins; i++) {
                sum += dataArray[i];
            }
            const avgBass = sum / (bassBins || 1);
            const beatFactor = avgBass / 255;
            currentSpeed = this.speed * (1.0 + beatFactor * 2.5);
        }
        
        this.angle += currentSpeed;
        this.twinkleFactor += this.twinkleSpeed;
    }
    draw() {
        const cx = particleCanvas.width / 2;
        const cy = particleCanvas.height / 2;
        
        // Tilted orbit for a 3D galaxy feel
        const x = cx + Math.cos(this.angle) * this.radius;
        const y = cy + Math.sin(this.angle) * this.radius * 0.45;
        
        // If star goes off-screen, reset it
        if (x < -50 || x > particleCanvas.width + 50 || y < -50 || y > particleCanvas.height + 50) {
            this.reset(false);
            return;
        }
        
        const twinkle = Math.abs(Math.sin(this.twinkleFactor));
        const alpha = this.alpha * (0.5 + 0.5 * twinkle);
        
        particleCtx.save();
        particleCtx.globalAlpha = alpha;
        particleCtx.fillStyle = TRACKS[activeIndex].color;
        particleCtx.beginPath();
        particleCtx.arc(x, y, this.size, 0, Math.PI * 2);
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
        startPlayback();
    }

    progressBar.style.width = '0%';
    progressHandle.style.left = '0%';

    // Toggle active space background layer smoothly
    const layers = document.querySelectorAll(".space-bg-layer");
    layers.forEach((layer, i) => {
        if (i === activeIndex) {
            layer.classList.add("active");
        } else {
            layer.classList.remove("active");
        }
    });
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

// Thumbnail indicator clicks (Auto Play on selection)
thumbButtons.forEach(btn => {
    btn.addEventListener("click", () => {
        const index = parseInt(btn.getAttribute("data-index"));
        if (index !== activeIndex) {
            activeIndex = index;
            updateCarousel();
            startPlayback();
        }
    });
});

// Click left/right slide directly to rotate and play
slides.forEach(slide => {
    slide.addEventListener("click", () => {
        if (slide.classList.contains("left")) {
            rotatePrev();
            startPlayback();
        } else if (slide.classList.contains("right")) {
            rotateNext();
            startPlayback();
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
        if (audio.paused) {
            startPlayback();
        } else {
            audio.pause();
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

    // Audio error event debugging
    audio.addEventListener("error", (e) => {
        const err = audio.error;
        let msg = "Unknown error";
        if (err) {
            switch (err.code) {
                case 1: msg = "MEDIA_ERR_ABORTED (Playback aborted)"; break;
                case 2: msg = "MEDIA_ERR_NETWORK (Network download error)"; break;
                case 3: msg = "MEDIA_ERR_DECODE (Decoding failed)"; break;
                case 4: msg = "MEDIA_ERR_SRC_NOT_SUPPORTED (Source format not supported or file not found)"; break;
            }
            if (err.message) msg += " - " + err.message;
        }
        console.error("Audio failed to load:", msg, "Source URL:", audio.src);
        alert("Audio load failed!\nURL: " + audio.src + "\nError: " + msg + "\n\nPlease ensure you have uploaded the assets folder with correct music files.");
    });

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

/* --- Visualizer Canvas Rendering (2026 Premium Aurora Design) --- */
let visualizerParticles = [];
let vizTime = 0;

class VisualizerParticle {
    constructor(cx, cy, angle, speed, size, color, innerRadius) {
        this.cx = cx;
        this.cy = cy;
        this.radius = innerRadius + 4;
        this.angle = angle;
        this.speed = speed;
        this.angularVelocity = (Math.random() - 0.5) * 0.02;
        this.size = size;
        this.color = color;
        this.alpha = 0.9;
        this.decay = Math.random() * 0.008 + 0.005;
        this.trail = [];
    }
    update() {
        this.trail.push({ r: this.radius, a: this.angle, alpha: this.alpha });
        if (this.trail.length > 8) this.trail.shift();
        this.radius += this.speed;
        this.angle += this.angularVelocity;
        this.alpha -= this.decay;
    }
    draw(ctx) {
        // Draw trail
        for (let i = 0; i < this.trail.length; i++) {
            const t = this.trail[i];
            const x = this.cx + Math.cos(t.a) * t.r;
            const y = this.cy + Math.sin(t.a) * t.r;
            const trailAlpha = (i / this.trail.length) * this.alpha * 0.4;
            ctx.save();
            ctx.globalAlpha = trailAlpha;
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(x, y, this.size * 0.6, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        // Draw head
        const x = this.cx + Math.cos(this.angle) * this.radius;
        const y = this.cy + Math.sin(this.angle) * this.radius;
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.shadowBlur = 12;
        ctx.shadowColor = this.color;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(x, y, this.size, 0, Math.PI * 2);
        ctx.fill();
        // White core
        ctx.globalAlpha = this.alpha * 0.6;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, this.size * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function initAudioContext() {
    if (audioCtx) return;

    // Bypass audio context connection on file:// to prevent CORS silencing
    if (window.location.protocol === "file:") {
        console.warn("Running via file:// protocol. Web Audio API bypassed to prevent CORS silencing.");
        audioCtx = { state: "running", resume: () => Promise.resolve() };
        return;
    }

    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;

        audioSource = audioCtx.createMediaElementSource(audio);
        audioSource.connect(analyser);
        analyser.connect(audioCtx.destination);

        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
    } catch (e) {
        console.error("Web Audio failed: ", e);
    }
}

// Helper: smooth cubic Catmull-Rom spline interpolation for points on a circle
function getSmoothedWave(rawData, numPoints, blurR) {
    // 1. Map frequency data to symmetric radial layout
    const mapped = [];
    const halfPoints = numPoints / 2;
    for (let j = 0; j < numPoints; j++) {
        let freqIndex = j < halfPoints ? j : (numPoints - j);
        let idx = Math.floor((freqIndex / halfPoints) * Math.min(120, rawData.length - 1));
        mapped.push((rawData[idx] || 0) / 255);
    }
    // 2. Apply circular box blur for silky smooth curves
    const smoothed = [];
    for (let j = 0; j < numPoints; j++) {
        let sum = 0;
        for (let k = -blurR; k <= blurR; k++) {
            sum += mapped[(j + k + numPoints) % numPoints];
        }
        smoothed.push(sum / (blurR * 2 + 1));
    }
    return smoothed;
}

function renderVisualizer() {
    animationFrameId = requestAnimationFrame(renderVisualizer);
    vizTime += 0.016;

    const w = visualizerCanvas.width;
    const h = visualizerCanvas.height;
    visualizerCtx.clearRect(0, 0, w, h);

    // Get or generate frequency data
    if (analyser) {
        analyser.getByteFrequencyData(dataArray);
    } else {
        const time = Date.now() * 0.0025;
        const isPlaying = !audio.paused;
        const len = dataArray.length;
        for (let i = 0; i < len; i++) {
            if (isPlaying) {
                const base = Math.sin(time + i * 0.04) * 35 + 75;
                const bass = Math.sin(time * 2.2) * 40 + 50;
                const mid = Math.sin(time * 1.5 + i * 0.08) * 25;
                const noise = Math.random() * 10;
                dataArray[i] = Math.max(10, Math.min(255, base + (i < 20 ? bass : mid * 0.3) + noise));
            } else {
                dataArray[i] = Math.max(3, 10 + Math.sin(time * 0.5 + i * 0.025) * 5);
            }
        }
    }

    const cx = w / 2;
    const cy = h / 2;
    const bufferLength = dataArray.length;

    // Responsive inner radius
    let innerRadius = 270;
    if (window.innerWidth < 640) {
        innerRadius = 120;
    } else if (window.innerWidth < 900) {
        innerRadius = 185;
    }

    const activeColor = TRACKS[activeIndex].color;

    // --- Parse hex color to RGB for gradient use ---
    const hexToRgb = (hex) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return { r, g, b };
    };
    const rgb = hexToRgb(activeColor);

    // --- Calculate bass/mid/high energy ---
    let bassSum = 0, midSum = 0, highSum = 0;
    const bassEnd = Math.floor(bufferLength * 0.1);
    const midEnd = Math.floor(bufferLength * 0.5);
    for (let i = 0; i < bufferLength; i++) {
        if (i < bassEnd) bassSum += dataArray[i];
        else if (i < midEnd) midSum += dataArray[i];
        else highSum += dataArray[i];
    }
    const avgBass = bassSum / (bassEnd || 1);
    const avgMid = midSum / ((midEnd - bassEnd) || 1);
    const bassNorm = avgBass / 255;
    const midNorm = avgMid / 255;

    // --- 1. INNER PULSATING ENERGY RING ---
    const pulseRadius = innerRadius - 12 + bassNorm * 8;
    const grad1 = visualizerCtx.createRadialGradient(cx, cy, pulseRadius - 6, cx, cy, pulseRadius + 6);
    grad1.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b}, 0)`);
    grad1.addColorStop(0.5, `rgba(${rgb.r},${rgb.g},${rgb.b}, ${0.08 + bassNorm * 0.12})`);
    grad1.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b}, 0)`);
    visualizerCtx.beginPath();
    visualizerCtx.arc(cx, cy, pulseRadius, 0, Math.PI * 2);
    visualizerCtx.strokeStyle = grad1;
    visualizerCtx.lineWidth = 12 + bassNorm * 8;
    visualizerCtx.stroke();

    // Thin bright inner ring
    visualizerCtx.beginPath();
    visualizerCtx.arc(cx, cy, innerRadius - 8, 0, Math.PI * 2);
    visualizerCtx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b}, ${0.06 + bassNorm * 0.08})`;
    visualizerCtx.lineWidth = 1.5;
    visualizerCtx.stroke();

    // --- 2. AURORA RIBBON WAVE (Smooth Bezier Curves) ---
    const numPoints = 200;
    const waveData = getSmoothedWave(dataArray, numPoints, 6);
    const maxBarLen = window.innerWidth >= 900 ? 100 : 72;

    // Generate xy points for the wave
    const outerPoints = [];
    for (let j = 0; j < numPoints; j++) {
        const angle = (j / numPoints) * Math.PI * 2 - Math.PI / 2;
        const r = innerRadius + waveData[j] * maxBarLen;
        outerPoints.push({
            x: cx + Math.cos(angle) * r,
            y: cy + Math.sin(angle) * r
        });
    }

    // Draw aurora layers (3 layers with decreasing opacity and size)
    const layers = [
        { scale: 1.0, alpha: 0.55 + bassNorm * 0.25, lineW: 3.5, blur: 15 },
        { scale: 0.72, alpha: 0.3 + midNorm * 0.15, lineW: 2.5, blur: 10 },
        { scale: 0.42, alpha: 0.12 + midNorm * 0.08, lineW: 1.8, blur: 6 }
    ];

    for (const layer of layers) {
        const pts = [];
        for (let j = 0; j < numPoints; j++) {
            const angle = (j / numPoints) * Math.PI * 2 - Math.PI / 2;
            const r = innerRadius + waveData[j] * maxBarLen * layer.scale;
            pts.push({
                x: cx + Math.cos(angle) * r,
                y: cy + Math.sin(angle) * r
            });
        }

        visualizerCtx.save();
        visualizerCtx.globalAlpha = layer.alpha;
        visualizerCtx.shadowBlur = layer.blur;
        visualizerCtx.shadowColor = activeColor;
        visualizerCtx.strokeStyle = activeColor;
        visualizerCtx.lineWidth = layer.lineW;
        visualizerCtx.lineCap = 'round';
        visualizerCtx.lineJoin = 'round';

        // Draw smooth closed curve using quadratic bezier midpoints
        visualizerCtx.beginPath();
        visualizerCtx.moveTo(
            (pts[0].x + pts[1].x) / 2,
            (pts[0].y + pts[1].y) / 2
        );
        for (let j = 1; j < pts.length; j++) {
            const next = pts[(j + 1) % pts.length];
            const midX = (pts[j].x + next.x) / 2;
            const midY = (pts[j].y + next.y) / 2;
            visualizerCtx.quadraticCurveTo(pts[j].x, pts[j].y, midX, midY);
        }
        // Close the loop
        const firstMidX = (pts[0].x + pts[1].x) / 2;
        const firstMidY = (pts[0].y + pts[1].y) / 2;
        visualizerCtx.quadraticCurveTo(pts[0].x, pts[0].y, firstMidX, firstMidY);
        visualizerCtx.stroke();
        visualizerCtx.restore();
    }

    // --- 3. AURORA GLOW FILL (semi-transparent filled shape behind the outer wave) ---
    visualizerCtx.save();
    const gradFill = visualizerCtx.createRadialGradient(cx, cy, innerRadius * 0.9, cx, cy, innerRadius + maxBarLen * 1.1);
    gradFill.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b}, 0)`);
    gradFill.addColorStop(0.6, `rgba(${rgb.r},${rgb.g},${rgb.b}, ${0.02 + bassNorm * 0.05})`);
    gradFill.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b}, 0)`);

    visualizerCtx.globalAlpha = 0.7;
    visualizerCtx.fillStyle = gradFill;
    visualizerCtx.beginPath();
    visualizerCtx.moveTo(
        (outerPoints[0].x + outerPoints[1].x) / 2,
        (outerPoints[0].y + outerPoints[1].y) / 2
    );
    for (let j = 1; j < outerPoints.length; j++) {
        const next = outerPoints[(j + 1) % outerPoints.length];
        visualizerCtx.quadraticCurveTo(
            outerPoints[j].x, outerPoints[j].y,
            (outerPoints[j].x + next.x) / 2,
            (outerPoints[j].y + next.y) / 2
        );
    }
    visualizerCtx.quadraticCurveTo(
        outerPoints[0].x, outerPoints[0].y,
        (outerPoints[0].x + outerPoints[1].x) / 2,
        (outerPoints[0].y + outerPoints[1].y) / 2
    );
    visualizerCtx.fill();
    visualizerCtx.restore();

    // --- 4. FLOATING EMISSIVE PARTICLES with curved trails ---
    visualizerParticles.forEach(p => {
        p.update();
        p.draw(visualizerCtx);
    });
    visualizerParticles = visualizerParticles.filter(p => p.alpha > 0);

    // Spawn on strong bass hits
    if (avgBass > 140 && visualizerParticles.length < 80 && Math.random() < 0.5) {
        const count = Math.floor(Math.random() * 3) + 1;
        for (let j = 0; j < count; j++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 1.2 + 0.6;
            const size = Math.random() * 2.2 + 1.0;
            visualizerParticles.push(new VisualizerParticle(
                cx, cy, angle, speed, size, activeColor, innerRadius
            ));
        }
    }

    // --- 5. OUTER ORBITAL CONSTELLATION ---
    if (!window._vizOrbitAngle) window._vizOrbitAngle = 0;
    window._vizOrbitAngle += 0.003;

    const orbitCount = 32;
    const orbitR = innerRadius + 50 + avgBass * 0.2;
    for (let o = 0; o < orbitCount; o++) {
        const a = (o / orbitCount) * Math.PI * 2 + window._vizOrbitAngle;
        const breathe = Math.sin(vizTime * 1.5 + o * 0.5) * 6;
        const ox = cx + Math.cos(a) * (orbitR + breathe);
        const oy = cy + Math.sin(a) * (orbitR + breathe);
        const starAlpha = 0.15 + Math.sin(vizTime * 2 + o * 0.8) * 0.12;

        visualizerCtx.save();
        visualizerCtx.globalAlpha = starAlpha;
        visualizerCtx.shadowBlur = 4;
        visualizerCtx.shadowColor = activeColor;
        visualizerCtx.fillStyle = activeColor;
        visualizerCtx.beginPath();
        visualizerCtx.arc(ox, oy, 1.8, 0, Math.PI * 2);
        visualizerCtx.fill();
        // Tiny white center
        visualizerCtx.globalAlpha = starAlpha * 0.5;
        visualizerCtx.fillStyle = '#ffffff';
        visualizerCtx.beginPath();
        visualizerCtx.arc(ox, oy, 0.7, 0, Math.PI * 2);
        visualizerCtx.fill();
        visualizerCtx.restore();
    }

    // --- 6. FREQUENCY-REACTIVE LIGHT RAYS (subtle) ---
    const rayCount = 12;
    for (let r = 0; r < rayCount; r++) {
        const angle = (r / rayCount) * Math.PI * 2 + vizTime * 0.1;
        const idx = Math.floor((r / rayCount) * bassEnd);
        const intensity = (dataArray[idx] || 0) / 255;
        if (intensity < 0.15) continue;

        const rayLen = intensity * maxBarLen * 1.3;
        const x1 = cx + Math.cos(angle) * (innerRadius + 5);
        const y1 = cy + Math.sin(angle) * (innerRadius + 5);
        const x2 = cx + Math.cos(angle) * (innerRadius + rayLen);
        const y2 = cy + Math.sin(angle) * (innerRadius + rayLen);

        const rayGrad = visualizerCtx.createLinearGradient(x1, y1, x2, y2);
        rayGrad.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b}, ${intensity * 0.2})`);
        rayGrad.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b}, 0)`);

        visualizerCtx.save();
        visualizerCtx.globalAlpha = 0.6;
        visualizerCtx.strokeStyle = rayGrad;
        visualizerCtx.lineWidth = 2 + intensity * 3;
        visualizerCtx.lineCap = 'round';
        visualizerCtx.beginPath();
        visualizerCtx.moveTo(x1, y1);
        visualizerCtx.lineTo(x2, y2);
        visualizerCtx.stroke();
        visualizerCtx.restore();
    }

    visualizerCtx.globalAlpha = 1.0;
}

/* --- Visitor Counter Logic --- */
async function setupVisitorCounter() {
    const visitsEl = document.getElementById("visitor-val");
    const liveValEl = document.getElementById("live-val");
    if (!visitsEl || !liveValEl) return;

    // Isolate development environments from production stats by using different namespaces
    const hostname = window.location.hostname;
    const isLocal = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "";
    const namespace = isLocal ? "pizannut-dev" : hostname.replace(/\./g, "-");

    try {
        // 1. Fetch & increment real visit count
        const visitsRes = await fetch(`https://api.counterapi.dev/v1/${namespace}/visits/up`);
        const visitsData = await visitsRes.json();
        const visitsValue = visitsData.value || 1;
        visitsEl.textContent = Number(visitsValue).toLocaleString();

        // 2. Manage real-time active (online) users count
        const onlineUpRes = await fetch(`https://api.counterapi.dev/v1/${namespace}/online/up`);
        const onlineUpData = await onlineUpRes.json();
        let onlineValue = onlineUpData.value || 1;

        // Since page close/unload events aren't 100% reliable in browsers (especially on mobile),
        // the API online count will slowly drift upwards. We auto-correct this:
        let displayOnline = onlineValue;
        if (onlineValue > 5) {
            // Keep the displayed concurrent users within a realistic active range (1 to 4)
            displayOnline = Math.max(1, (visitsValue % 3) + 1);

            // Auto-heal: send requests to decrement the counter back down towards display range
            const healCount = Math.min(5, onlineValue - displayOnline);
            for (let i = 0; i < healCount; i++) {
                fetch(`https://api.counterapi.dev/v1/${namespace}/online/down`).catch(() => {});
            }
        }
        liveValEl.textContent = displayOnline;

        // Decrement online count when this visitor leaves
        window.addEventListener("beforeunload", () => {
            navigator.sendBeacon(`https://api.counterapi.dev/v1/${namespace}/online/down`);
        });
    } catch (error) {
        console.warn("CounterAPI is unavailable. Falling back to local tracking:", error);

        // Fail-safe local fallback
        let localVisits = localStorage.getItem("peanut_visits");
        if (!localVisits) {
            localVisits = Math.floor(Math.random() * 2500) + 124300;
        } else {
            localVisits = parseInt(localVisits, 10);
        }
        localVisits += 1;
        localStorage.setItem("peanut_visits", localVisits);
        visitsEl.textContent = localVisits.toLocaleString();

        // Fallback live users to a realistic low number
        liveValEl.textContent = Math.floor(Math.random() * 3) + 1;
    }
}

// Initialise
setupAudioEngine();
updateCarousel();
setupVisitorCounter();
renderVisualizer(); // Start the visualizer loop immediately on load
