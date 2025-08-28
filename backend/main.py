import os
import cv2
import ffmpeg
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
import logging
import numpy as np
from helpers import *
from video import apply_filter, grayscale_filter, sepia_filter, nop_filter

app = Flask(__name__)
cors = CORS(app)

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.route("/hello-world", methods=["GET"])
def hello_world():
    try:
        return jsonify({"Hello": "World"}), 200
    except Exception as e:
        logger.error(f"Error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/process", methods=["POST"])
def process():
    data = request.json
    try:
        video_url = data.get("video_url")
        filter_type = data.get("filter")
        filters = {"sepia": sepia_filter, "grayscale": grayscale_filter, "no transform": nop_filter}
        if filter_type not in filters:
            return jsonify({"error": "Invalid filter type"}), 400
        if not video_url:
            return jsonify({"error": "video_url is required"}), 400
        out_path = get_temp_mp4_path()
        download_video(video_url, out_path)
        apply_filter(out_path, filters[filter_type])
        return jsonify({"path": f"/videos/{os.path.basename(out_path)}"}), 200
    except Exception as e:
        logger.error(f"Error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/videos/<path:filename>", methods=["GET"])
def get_video(filename):
    return send_from_directory(VIDEO_DIR, filename)

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=8080, debug=True, use_reloader=False)
