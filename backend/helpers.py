import logging
import ffmpeg
import os
import uuid
import cv2

# A lightweight face detection model
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
profile_face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_profileface.xml')
        
# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

TMP_DIR = os.path.join(os.path.dirname(__file__), "temp")

def get_temp_path():
    os.makedirs(TMP_DIR, exist_ok=True)
    random_filename = f"temp_{str(uuid.uuid4())[:8]}"
    return os.path.join(TMP_DIR, random_filename)

def get_temp_mp4_path():
    return f"{get_temp_path()}.mp4"

def download_video(video_url, output_path):
    try:
        ffmpeg.input(video_url).output(output_path).run(overwrite_output=True, quiet=True)
        logger.info(f"Downloaded video from {video_url} to {output_path}")
    except Exception as e:
        logger.error(f"Error downloading video: {e}")
        raise