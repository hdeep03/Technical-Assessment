import React, { useRef, useState } from 'react';
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

const App: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);

  // form state
  const [inputUrl, setInputUrl] = useState<string>(videoUrl);
  const [selectedFilter, setSelectedFilter] = useState<FilterKey>('no transform');

  // app state
  const [stage, setStage] = useState<Stage>('idle');
  const [processedUrl, setProcessedUrl] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const handleDownload = async () => {
    try {
      const res = await fetch(processedUrl);
      if (!res.ok) throw new Error('Failed to fetch video');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'processed-video.mp4'; // force download
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

      // Expecting: { processedUrl: string }
      const data: { path?: string } = await res.json();
      if (!data.path) throw new Error('Malformed response: missing path');
      setProcessedUrl(`${backendUrl}/${data.path}`);
      setStage('done');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to process video');
      setStage('idle');
    }
  };

  const reset = () => {
    setStage('idle');
    setProcessedUrl('');
    setErrorMsg('');
  };

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

        {/* Stage: processing -> show spinner */}
        {stage === 'processing' && (
          <div style={{ padding: 40 }}>
            <div className="spinner-border" role="status" aria-label="Processing" />
            <div style={{ marginTop: 12 }}>Processing your video…</div>
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
              <button onClick={reset} className="btn btn-link" style={{ marginLeft: 8 }}>
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
