import React, { useEffect, useRef, useState } from 'react';
import VideoPlayer from './components/VideoPlayer';
import { videoUrl, backendUrl } from './consts';

export interface FaceDetection {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  label?: string;
}

type FilterKey = 'grayscale' | 'sepia' | 'no transform';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'grayscale', label: 'Grayscale' },
  { key: 'sepia', label: 'Sepia' },
  { key: 'no transform', label: 'No filter' },
];

type Stage = 'idle' | 'processing' | 'done';

type StatusResponse = {
  status?: 'processing' | 'completed' | string;
  progress?: number;
  total_frames?: number;
  error?: string;
};

const App: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);

  // form state
  const [inputUrl, setInputUrl] = useState<string>(videoUrl);
  const [selectedFilter, setSelectedFilter] = useState<FilterKey>('no transform');

  // app state
  const [stage, setStage] = useState<Stage>('idle');
  const [processedUrl, setProcessedUrl] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  // processing state
  const [jobId, setJobId] = useState<string | null>(null);
  const [framesDone, setFramesDone] = useState<number>(0);
  const [totalFrames, setTotalFrames] = useState<number>(0);

  // thumbnail (blob URL so we bypass cache without query params)
  const [thumbUrlObject, setThumbUrlObject] = useState<string | null>(null);
  const [thumbTried, setThumbTried] = useState<boolean>(false); // have we attempted at least once?

  const handleDownload = async () => {
    try {
      const res = await fetch(processedUrl);
      if (!res.ok) throw new Error('Failed to fetch video');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'processed-video.mp4';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  const handleProcess = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setStage('processing');
    setFramesDone(0);
    setTotalFrames(0);
    setProcessedUrl('');
    setJobId(null);

    // reset thumbnail state
    if (thumbUrlObject) {
      URL.revokeObjectURL(thumbUrlObject);
    }
    setThumbUrlObject(null);
    setThumbTried(false);

    try {
      const res = await fetch(`${backendUrl}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_url: inputUrl, filter: selectedFilter }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed with status ${res.status}`);
      }

      const data: { job_id?: string; error?: string } = await res.json();
      if (!data.job_id) throw new Error(data.error || 'Malformed response: missing job_id');

      setJobId(data.job_id);
      // processed file will be served at /videos/<job_id> when completed
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to start processing');
      setStage('idle');
    }
  };

  // Helper to make backend thumbnail path from jobId
  const getThumbPath = (id: string) => {
    const base = id.endsWith('.mp4') ? id.slice(0, -4) : id;
    return `${backendUrl}/thumb/${base}.jpg`;
  };

  // Try to fetch thumbnail (no cache-busting params; use fetch no-store, then blob URL)
  const tryFetchThumbnail = async (id: string) => {
    try {
      const res = await fetch(getThumbPath(id), { cache: 'no-store' });
      if (!res.ok) {
        setThumbTried(true);
        return false;
      }
      const blob = await res.blob();
      if (thumbUrlObject) URL.revokeObjectURL(thumbUrlObject);
      const objUrl = URL.createObjectURL(blob);
      setThumbUrlObject(objUrl);
      setThumbTried(true);
      return true;
    } catch {
      setThumbTried(true);
      return false;
    }
  };

  // Poll job status while processing; also attempt thumbnail fetch until it succeeds once
  useEffect(() => {
    if (stage !== 'processing' || !jobId) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(`${backendUrl}/status/${jobId}`);
        const s: StatusResponse = await res.json();

        if (!res.ok || s.error) {
          if (!cancelled) {
            setErrorMsg(s.error || 'Processing failed');
            setStage('idle');
          }
          return;
        }

        if (!cancelled) {
          const done = s.progress ?? 0;
          const total = s.total_frames ?? 0;
          setFramesDone(done);
          setTotalFrames(total);

          // Try to fetch thumbnail if we don't have it yet
          if (!thumbUrlObject) {
            await tryFetchThumbnail(jobId);
          }

          if (s.status === 'completed') {
            setProcessedUrl(`${backendUrl}/videos/${jobId}`);
            setStage('done');
            return;
          }
        }

        if (!cancelled) {
          setTimeout(poll, 700); // ~0.7s cadence
        }
      } catch {
        if (!cancelled) {
          setTimeout(poll, 1200); // backoff on transient errors
        }
      }
    };

    poll();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, jobId]);

  const reset = () => {
    setStage('idle');
    setProcessedUrl('');
    setErrorMsg('');
    setJobId(null);
    setFramesDone(0);
    setTotalFrames(0);

    if (thumbUrlObject) {
      URL.revokeObjectURL(thumbUrlObject);
      setThumbUrlObject(null);
    }
    setThumbTried(false);
  };

  const pct =
    totalFrames > 0 ? Math.min(100, Math.max(0, Math.round((framesDone / totalFrames) * 100))) : 0;

  return (
    <div className="container" style={{ maxWidth: 960, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', paddingTop: 24 }}>
        {/* Stage: idle -> show form */}
        {stage === 'idle' && (
          <form onSubmit={handleProcess} className="form-container">
            <h3>Process a Video</h3>

            <div>
              <label htmlFor="videoUrl" className="form-label">Video URL</label>
              <input
                id="videoUrl"
                type="url"
                required
                className="form-control"
                placeholder="https://example.com/video.mp4"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="filter" className="form-label">Filter</label>
              <select
                id="filter"
                className="form-select"
                value={selectedFilter}
                onChange={(e) => setSelectedFilter(e.target.value as FilterKey)}
              >
                {FILTERS.map((f) => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button type="submit" className="btn btn-primary">Process</button>
              {errorMsg && <div className="text-danger" style={{ alignSelf: 'center' }}>{errorMsg}</div>}
            </div>
          </form>
        )}

        {/* Stage: processing -> show progress + thumbnail */}
        {stage === 'processing' && (
          <div className="form-container" style={{ textAlign: 'left' }}>
            <h3>Processing your video…</h3>

            {/* Thumbnail preview (blob URL) */}
            {jobId && (
              <div className="thumb-wrap">
                {thumbUrlObject ? (
                  <img className="thumb" src={thumbUrlObject} alt="thumbnail" />
                ) : (
                  <div className="thumb-fallback">
                    <div className="spinner-border" role="status" aria-label="Loading thumbnail" />
                    <span>{thumbTried ? 'Waiting for thumbnail…' : 'Preparing preview…'}</span>
                  </div>
                )}
              </div>
            )}

            {/* Progress bar */}
            <div style={{ background: '#eee', borderRadius: 8, overflow: 'hidden', height: 12, margin: '12px 0' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: '#007bff', transition: 'width .3s' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#555' }}>
              <span>{pct}%</span>
              <span>{framesDone} / {totalFrames} frames</span>
            </div>

            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="spinner-border" role="status" aria-label="Processing" />
              <span style={{ color: '#666' }}>Applying filters…</span>
            </div>

            {errorMsg && <div className="text-danger" style={{ marginTop: 12 }}>{errorMsg}</div>}
          </div>
        )}

        {/* Stage: done -> show player + actions */}
        {stage === 'done' && (
          <>
            <div className="video-container" style={{ marginTop: 20 }}>
              <VideoPlayer
                ref={videoRef}
                src={processedUrl}
                onLoadedMetadata={() => console.log('Processed video loaded')}
              />
            </div>

            <div style={{ marginTop: 16 }}>
              <button onClick={handleDownload} className="btn btn-outline-secondary">
                Download Video
              </button>
              <button onClick={reset} className="btn btn-primary" style={{ marginLeft: 8 }}>
                Process another video
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default App;
