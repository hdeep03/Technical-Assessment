import cv2
from helpers import get_temp_mp4_path, face_cascade
import os
import ffmpeg
import numpy as np

def nop_filter(frame):
    return frame

def grayscale_filter(frame):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    gray3 = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
    return gray3

def sepia_filter(frame):
    sepia = np.array([[0.272, 0.534, 0.131],
                      [0.349, 0.686, 0.168],
                      [0.393, 0.769, 0.189]])
    return cv2.transform(frame, sepia)

def apply_filter(video_path, filter_func):
    transform_video_only_out = get_temp_mp4_path() 
    tmp_out = get_temp_mp4_path()

    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(transform_video_only_out, fourcc, fps, (frame_width, frame_height))
    fg_mask = None
    i = 0
    f = 2
    while True:
        print(i)
        ok, frame = cap.read()
        if not ok:
            break
        if fg_mask is None or i % (fps // f) == 0:
            fg_mask = extract_fg(frame)
        transformed_bgd = filter_func(frame)
        result = np.where(fg_mask[..., None] >= 128, frame, transformed_bgd)
        out.write(result)
        i += 1
    cap.release()
    out.release()

    input_video = ffmpeg.input(transform_video_only_out)
    input_audio = ffmpeg.input(video_path)

    (
        ffmpeg
        .output(
            input_video.video,
            input_audio.audio,
            tmp_out,
            vcodec='libx264',
            acodec='aac',
            pix_fmt='yuv420p',
            crf=20,
            preset='veryfast',
            movflags='+faststart'
        )
        .overwrite_output()
        .run(quiet=True)
    )
    os.replace(tmp_out, video_path)

def postprocess_mask(mask):
    """
    mask: 0/255 uint8 foreground mask
    returns: cleaned mask (0/255 uint8)
    """
    H, W = mask.shape
    k = max(3, (min(H, W) // 100) | 1)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))

    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=1)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
    return mask

def extract_fg(frame):
    H, W = frame.shape[:2]

    small_frame = cv2.resize(frame, (W // 4, H // 4), interpolation=cv2.INTER_LINEAR)
    lab = cv2.cvtColor(small_frame, cv2.COLOR_BGR2Lab)
    gray = cv2.cvtColor(small_frame, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape

    mask = np.full((h, w), cv2.GC_PR_BGD, dtype=np.uint8)

    border = max(2, min(h, w) // 100)
    mask[:border, :] = cv2.GC_BGD
    mask[-border:, :] = cv2.GC_BGD
    mask[:, :border] = cv2.GC_BGD
    mask[:, -border:] = cv2.GC_BGD

    faces = face_cascade.detectMultiScale(
        gray, scaleFactor=1.1, minNeighbors=3, minSize=(8, 8),
        flags=cv2.CASCADE_SCALE_IMAGE
    )

    if len(faces) == 0:
        return np.zeros((H, W), dtype=np.uint8)

    x, y, fw, fh = max(faces, key=lambda r: r[2] * r[3])

    mask[y:y+fh, x:x+fw] = cv2.GC_PR_FGD

    side_mult = 1.2
    down_mult = 2.0

    cx = x + fw / 2.0
    face_w = fw
    face_h = fh

    x1 = int(max(0, np.floor(cx - (face_w / 2) - side_mult * face_w)))
    x2 = int(min(w, np.ceil (cx + (face_w / 2) + side_mult * face_w)))
    y1 = y+fh
    y2 = int(min(h, np.ceil (y + fh + down_mult * face_h)))

    if x2 > x1 and y2 > y1:
        mask[y1:y2, x1:x2] = cv2.GC_PR_FGD

    bgd_model = np.zeros((1, 65), np.float64)
    fgd_model = np.zeros((1, 65), np.float64)

    cv2.grabCut(
        lab, mask, None,
        bgd_model, fgd_model, iterCount=4, mode=cv2.GC_INIT_WITH_MASK
    )

    fgmask_small = np.where(
        (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0
    ).astype(np.uint8)

    fgmask = cv2.resize(fgmask_small, (W, H), interpolation=cv2.INTER_NEAREST)
    fgmask = postprocess_mask(fgmask)
    return fgmask