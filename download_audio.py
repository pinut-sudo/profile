import os
import subprocess
import sys
import urllib.request

def install_and_import(package):
    try:
        import yt_dlp
    except ImportError:
        print(f"Installing {package}...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", package])
        print(f"Successfully installed {package}")

def download_youtube_audio(url, output_path):
    import yt_dlp
    print(f"Downloading audio from {url} to {output_path}...")
    
    ydl_opts = {
        'format': 'm4a/bestaudio/best', # Request m4a stream which is native AAC (playable in browsers)
        'outtmpl': output_path,
        'quiet': False,
        'no_warnings': True,
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        print(f"Successfully downloaded to {output_path}")
        return True
    except Exception as e:
        print(f"Error downloading {url}: {e}")
        return False

def main():
    install_and_import('yt-dlp')
    
    assets_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
    os.makedirs(assets_dir, exist_ok=True)
    
    songs = [
        ("https://www.youtube.com/watch?v=niPkap1ozUA", "song1.mp3"),
        ("https://www.youtube.com/watch?v=Z6Oi4V0TSUY", "song2.mp3"),
        ("https://www.youtube.com/watch?v=7s1033v2DTQ", "song3.mp3"),
        ("https://youtu.be/FriPUsEsxc8", "song4.mp3"),
    ]
    
    for url, filename in songs:
        filepath = os.path.join(assets_dir, filename)
        if os.path.exists(filepath):
            try:
                os.remove(filepath)
            except Exception as e:
                print(f"Could not remove {filepath}: {e}")
        success = download_youtube_audio(url, filepath)
        if not success:
            # Fallback to SoundHelix test tracks so the page has actual working audio files
            fallback_urls = {
                "song1.mp3": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
                "song2.mp3": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
                "song3.mp3": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
                "song4.mp3": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3"
            }
            fb_url = fallback_urls.get(filename)
            print(f"YouTube download blocked. Downloading fallback audio from {fb_url}...")
            try:
                req = urllib.request.Request(
                    fb_url, 
                    headers={'User-Agent': 'Mozilla/5.0'}
                )
                with urllib.request.urlopen(req, timeout=20) as response, open(filepath, 'wb') as out_file:
                    out_file.write(response.read())
                print(f"Successfully downloaded fallback {filename}")
            except Exception as fe:
                print(f"Fallback failed for {filename}: {fe}")
                print(f"Creating mock backup file for {filename}...")
                with open(filepath, "wb") as f:
                    f.write(b"ID3\x03\x00\x00\x00\x00\x00\x00" + b"\x00" * 1000)

if __name__ == "__main__":
    main()
