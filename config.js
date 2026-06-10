// PiZanNut Web Landing Page Configuration
const CONFIG = {
    // Brand Name displayed in top-left
    brandName: "PiZanNut",

    // Social Media Profile Links in top-right
    socials: {
        facebook: "https://www.facebook.com/pham.thach.2105",
        tiktok: "https://www.tiktok.com/@peanut_aov",
        discord: "https://discordapp.com/users/830723786923966465",
        instagram: "https://www.instagram.com/pizannut/"
    },

    // Audio Tracks List (Supports 4 tracks)
    // - title: Display name of the song
    // - artist: Artist name
    // - theme: Color theme identifier
    // - color: Accent color hex (particles, glow, visualizers)
    // - src: Path to the local MP3 file
    // - image: Image URL (YouTube cover or artist photo)
    tracks: [
        {
            title: "MAKING MY WAY",
            artist: "SƠN TÙNG M-TP",
            theme: "lime",
            color: "#a3e635",
            src: "assets/song1.mp3",
            image: "https://img.youtube.com/vi/niPkap1ozUA/maxresdefault.jpg"
        },
        {
            title: "ĐỪNG VỀ TRỄ",
            artist: "LĂNG LD x OBITO",
            theme: "cyan",
            color: "#22d3ee",
            src: "assets/song2.mp3",
            image: "https://img.youtube.com/vi/Z6Oi4V0TSUY/maxresdefault.jpg"
        },
        {
            title: "DOUBT",
            artist: "TWENTY ONE PILOTS",
            theme: "magenta",
            color: "#ec4899",
            src: "assets/song3.mp3",
            image: "https://img.youtube.com/vi/7s1033v2DTQ/maxresdefault.jpg"
        },
        {
            title: "SHE GOES BY",
            artist: "KAYARCHON REMIX",
            theme: "yellow",
            color: "#eab308",
            src: "assets/song4.mp3",
            image: "https://img.youtube.com/vi/FriPUsEsxc8/maxresdefault.jpg"
        }
    ]
};

// Expose globally
window.CONFIG = CONFIG;
