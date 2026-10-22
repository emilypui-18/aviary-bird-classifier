import React, { useEffect, useRef, useState } from 'react';

const API_BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:8000').replace(/\/$/, '');
const MAX_BYTES = 10 * 1024 * 1024;
const MIN_LOADING_MS = 1000; // Display analysis for at least one second.
const EXAMPLES = [
  { name: 'Cardinal', image: '/samples/cardinal.jpg' },
  { name: 'Blue Jay', image: '/samples/blue-jay.jpg' },
  { name: 'Cedar Waxwing', image: '/samples/cedar-waxwing.jpg' },
  { name: 'Scarlet Tanager', image: '/samples/scarlet-tanager.jpg' },
];

function Icon({ name, size = 18, ...props }) {
  const paths = {
    feather: <><path d="M20 4c-4.5-.5-12.5 1-16 9-2 5-1 8-1 8s3-3 8-4C19 14 20.5 7 20 4Z"/><path d="M3 21c5-6 10-9 17-17"/><path d="M9 16l-1-6M14 12l-1-6"/></>,
    upload: <><path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M4 16v4h16v-4"/></>,
    arrow: <><path d="M5 12h14m0 0-6-6m6 6-6 6"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    close: <path d="M18 6 6 18M6 6l12 12"/>,
    refresh: <><path d="M19 11a7 7 0 1 0-2 6"/><path d="M19 4v7h-7"/></>,
    sparkle: <><path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z"/><path d="m19 17 .6 2.4L22 20l-2.4.6L19 23l-.6-2.4L16 20l2.4-.6L19 17Z"/></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m4 17 5-5 4 4 3-3 4 4"/></>,
    alert: <><circle cx="12" cy="12" r="9"/><path d="M12 8v5m0 4v.1"/></>,
    down: <path d="m6 9 6 6 6-6"/>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {paths[name] || paths.feather}
    </svg>
  );
}

function Percent({ value, digits = 1 }) {
  return <>{(100 * Math.max(0, Math.min(1, Number(value) || 0))).toFixed(digits)}%</>;
}

function Stepper({ status, reset }) {
  const step = status === 'empty' || status === 'ready' ? 1 : status === 'loading' ? 2 : 3;
  return (
    <div className="card-topline">
      <div className="steps" aria-label="Classification steps">
        {['Photograph', 'Identify', 'Result'].map((label, index) => {
          const n = index + 1;
          return (
            <React.Fragment key={label}>
              {index > 0 && <span className="step-line" />}
              <span className={`step ${n === step ? 'active' : ''} ${n < step ? 'completed' : ''}`}>
                <span className="step-number">{n < step ? <Icon name="check" size={12} /> : n}</span>
                <span>{label}</span>
              </span>
            </React.Fragment>
          );
        })}
      </div>
      <button className="reset-link" type="button" onClick={reset}>Start over</button>
    </div>
  );
}

function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [status, setStatus] = useState('empty');
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [apiOnline, setApiOnline] = useState(null);
  const fileInput = useRef(null);
  const controller = useRef(null);
  const previewRef = useRef('');

  useEffect(() => {
    fetch(`${API_BASE}/health`).then(r => r.json()).then(d => setApiOnline(Boolean(d.model_files_present))).catch(() => setApiOnline(false));
    return () => { controller.current?.abort(); if (previewRef.current) URL.revokeObjectURL(previewRef.current); };
  }, []);

  function replacePreview(file) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = file ? URL.createObjectURL(file) : '';
    setPreview(previewRef.current);
  }

  function reset() {
    controller.current?.abort();
    setSelectedFile(null);
    setResult(null);
    setStatus('empty');
    setError('');
    replacePreview(null);
    if (fileInput.current) fileInput.current.value = '';
  }

  function acceptFile(file) {
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setError('Please select a JPG or PNG photograph.'); setStatus('error'); return;
    }
    if (file.size > MAX_BYTES) {
      setError('Please choose a photograph smaller than 10 MB.'); setStatus('error'); return;
    }
    controller.current?.abort();
    replacePreview(file);
    setSelectedFile(file);
    setResult(null);
    setError('');
    setStatus('ready');
  }

  async function useExample(example) {
    try {
      const response = await fetch(example.image);
      if (!response.ok) throw new Error('Example image could not be loaded.');
      const blob = await response.blob();
      acceptFile(new File([blob], `${example.name.toLowerCase().replaceAll(' ', '-')}.jpg`, { type: 'image/jpeg' }));
      document.getElementById('identify')?.scrollIntoView({ behavior: 'smooth' });
    } catch (e) { setError(e.message); setStatus('error'); }
  }

  async function classify() {
    if (!selectedFile) return;

    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const startedAt = performance.now();

    setStatus('loading');
    setError('');
    setResult(null);

    const body = new FormData();
    body.append('file', selectedFile);

    try {
      const response = await fetch(`${API_BASE}/predict`, {
        method: 'POST',
        body,
        signal: abort.signal
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.detail || `Classification failed (HTTP ${response.status}).`);
      }
      if (!data?.top5?.length || !data.predicted_species) {
        throw new Error('The server returned an unexpected result.');
      }

      // Keep the loading interface visible, even when inference is very fast.
      const remaining = MIN_LOADING_MS - (performance.now() - startedAt);
      if (remaining > 0) {
        await new Promise(resolve => setTimeout(resolve, remaining));
      }

      // Do not display results from a request the user has cancelled or replaced.
      if (abort.signal.aborted || controller.current !== abort) return;

      setResult(data);
      setStatus('result');
      setApiOnline(true);
    } catch (e) {
      if (abort.signal.aborted || controller.current !== abort || e.name === 'AbortError') return;

      setStatus('error');
      setError(
        e instanceof TypeError
          ? 'Unable to reach the classifier. Make sure the Python API is running on port 8000.'
          : e.message
      );
      if (e instanceof TypeError) setApiOnline(false);
    }
  }

  function scrollToIdentify() { document.getElementById('identify')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  function onDrop(e) { e.preventDefault(); setDragOver(false); acceptFile(e.dataTransfer.files?.[0]); }
  const formatFileSize = n => n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`;

  return (
    <div className="site-shell">
      <header className="site-header">
        <div className="container header-inner">
          <a href="#home" className="logo" aria-label="Aviary home"><span className="logo-mark"><Icon name="feather" size={16} /></span>Aviary</a>
          <nav className="header-nav" aria-label="Main navigation">
            <a href="#identify">Identify</a><a href="#the-model">The model</a><a href="#species">Species</a>
          </nav>
          <button type="button" className="nav-cta" onClick={scrollToIdentify}>Identify a bird <Icon name="arrow" size={14}/></button>
        </div>
      </header>

      <main id="home">
        <section className="hero-section" id="identify">
          <div className="container">
            <div className="intro-copy">
              <div className="eyebrow"><span className="eyebrow-line"/>BIRD IDENTIFICATION</div>
              <h1>Put a <em>name</em> to the bird<br className="desktop-break"/> in your photograph.</h1>
              <p>Upload a photo and the model returns the five most likely species, ranked by confidence.</p>
            </div>

            <section className="classifier-card" aria-label="Bird classification">
              <Stepper status={status} reset={reset}/>

              {status === 'empty' && (
                <div className={`upload-panel ${dragOver ? 'drag-over' : ''}`} onDrop={onDrop} onDragOver={e => {e.preventDefault();setDragOver(true);}} onDragLeave={() => setDragOver(false)}>
                  <div className="upload-inner">
                    <div className="upload-icon"><Icon name="feather" size={26}/><span className="upload-spark"><Icon name="sparkle" size={14}/></span></div>
                    <h2>Drop a bird photograph here</h2>
                    <p>JPG or PNG · up to 10 MB</p>
                    <button className="button primary" type="button" onClick={() => fileInput.current?.click()}><Icon name="upload" size={16} /> Choose a photograph</button>
                    <div className="upload-divider"><span />OR TRY AN EXAMPLE<span /></div>
                    <div className="upload-avatars">
                      {EXAMPLES.slice(0, 3).map(example => <button key={example.name} className="avatar-button" type="button" title={`Try ${example.name}`} aria-label={`Try a ${example.name} example`} onClick={() => useExample(example)}><img src={example.image} alt="" /></button>)}
                    </div>
                    <small>Or drag and drop your own photograph above.</small>
                  </div>
                </div>
              )}

              {status === 'ready' && (
                <div className="card-stage split-stage">
                  <div className="image-preview"><img src={preview} alt="Selected bird photograph"/><div className="photo-actions"><button onClick={() => fileInput.current?.click()} type="button" aria-label="Replace photo" title="Replace photo"><Icon name="refresh" size={18}/></button><button onClick={reset} type="button" aria-label="Remove photo" title="Remove photo"><Icon name="close" size={18}/></button></div></div>
                  <div className="stage-copy ready-copy"><span className="overline">PHOTOGRAPH READY</span><h2>One click and the model takes a look.</h2><p>It will compare your photograph against all 200 species and rank its five best guesses.</p><div className="file-chip"><span className="file-chip-icon"><Icon name="sparkle" size={18}/></span><span><strong>{selectedFile?.name}</strong><small>{formatFileSize(selectedFile?.size || 0)} · ready to identify</small></span></div><div className="inline-actions"><button className="button primary" onClick={classify} type="button">Identify this bird <Icon name="sparkle" size={16}/></button><button className="text-button" type="button" onClick={reset}>Remove</button></div></div>
                </div>
              )}

              {status === 'loading' && (
                <div className="card-stage split-stage" aria-live="polite" aria-busy="true">
                  <div className="image-preview analysing-image">
                    <img src={preview} alt="Bird photograph being analysed" />
                    <div className="scan-effect" aria-hidden="true" />
                    <span className="scan-label" aria-hidden="true">ANALYSING</span>
                  </div>
                  <div className="stage-copy process-copy">
                    <span className="overline">IDENTIFYING SPECIES</span>
                    <h2>Reading the plumage...</h2>
                    <p>Examining the photograph and ranking the most likely matches among 200 bird species.</p>
                    <div className="process-steps">
                      <div className="process-done"><Icon name="check" size={15} /> Photograph received</div>
                      <div className="process-pending"><span className="tiny-spinner" /> Analysing visual features</div>
                      <div className="process-next">Ranking possible matches</div>
                    </div>
                  </div>
                </div>
              )}

              {status === 'result' && result && (
                <div className="result-stage" aria-live="polite">
                  <div className="result-header-content"><div className="result-image"><img src={preview} alt="Your bird photograph"/><span className="image-label">MOST LIKELY MATCH</span></div><div className="result-copy"><span className="overline">MOST LIKELY SPECIES</span><h2>{result.predicted_species}</h2><p className="result-subtitle">Best match among {result.num_classes} bird species.</p><div className="confidence-top"><span className="overline">MODEL SCORE</span><strong><Percent value={result.confidence}/></strong></div><div className="confidence-track"><span style={{width:`${Math.max(0,Math.min(100,result.confidence*100))}%`}} /></div><p className="result-note">This score reflects the model's ranking, not a guaranteed identification. Similar-looking species may be confused.</p><div className="tag-row"><span>EfficientNetB0</span><span>224 × 224 input</span><span>Top-5 ranking</span></div></div></div>
                  <div className="other-matches"><div className="result-list-heading"><span className="overline">OTHER POSSIBILITIES</span><span className="overline">TOP FIVE</span></div>{result.top5.slice(1).map((match,index)=><div className="match-row" key={match.class_id}><span className="match-number">{String(index+2).padStart(2,'0')}</span><span className="match-name">{match.species}</span><span className="match-score"><Percent value={match.confidence}/></span></div>)}</div>
                  <div className="result-footer"><button type="button" className="button primary" onClick={reset}><Icon name="refresh" size={16}/> Identify another bird</button><span>Inference {result.inference_ms?.toFixed(0)} ms · {result.input_size} × {result.input_size}</span></div>
                </div>
              )}

              {status === 'error' && (
                <div className="error-stage"><div className="error-icon"><Icon name="alert" size={28}/></div><span className="overline">UNABLE TO IDENTIFY</span><h2>Something interrupted the classification.</h2><p>{error}</p><div className="inline-actions"><button className="button primary" type="button" onClick={() => selectedFile ? (setStatus('ready'),setError('')) : reset()}>{selectedFile ? 'Try again' : 'Choose another photo'}</button><button className="text-button" type="button" onClick={reset}>Start over</button></div></div>
              )}
            </section>
            <div className="card-footer-label"><span>CLASSIFIER STATUS</span><span className={`status-dot ${apiOnline ? 'online' : ''}`}/><span>{apiOnline === null ? 'Checking connection…' : apiOnline ? 'Model API connected' : 'Start the Python backend to classify'}</span><a href="#the-model">How it works <Icon name="arrow" size={13}/></a></div>
          </div>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" hidden onChange={e=>acceptFile(e.target.files?.[0])} />
        </section>

        <section className="model-section" id="the-model">
          <div className="container model-layout"><div className="section-heading"><span className="overline">THE MODEL</span><h2>A small, honest<br/> classifier.</h2><p>EfficientNetB0, fine-tuned in PyTorch across 200 bird species. It offers its five best guesses rather than a single verdict — because some photographs are genuinely ambiguous.</p></div><div className="metric-grid"><div className="metric"><span>ARCHITECTURE</span><strong>EfficientNetB0</strong><small>Convolutional neural network</small></div><div className="metric"><span>FRAMEWORK</span><strong>PyTorch</strong><small>ImageNet transfer learning</small></div><div className="metric"><span>SPECIES</span><strong>200</strong><small>Classes recognised</small></div><div className="metric"><span>TOP-1 ACCURACY</span><strong>79.57%</strong><small>First guess correct</small></div><div className="metric"><span>AVERAGE PER CLASS</span><strong>79.03%</strong><small>Mean accuracy across species</small></div><div className="metric"><span>TOP-5 ACCURACY</span><strong>94.52%</strong><small>Correct label in top five</small></div></div></div>
        </section>

        <section className="species-section" id="species"><div className="container"><div className="species-heading"><div><span className="overline">IN THE DATASET</span><h2>A few of the two hundred.</h2></div><p>Explore four example photographs from the evaluation dataset. Select one to try it in the classifier.</p></div><div className="species-grid">{EXAMPLES.map(example=><button className="species-card" key={example.name} type="button" onClick={()=>useExample(example)}><img src={example.image} alt={`${example.name} bird photograph`} loading="lazy"/><span className="species-card-footer"><span>{example.name}</span><Icon name="arrow" size={16}/></span></button>)}</div><p className="dataset-note">Images are from the supplied bird-classification dataset and are included for local academic demonstration.</p></div></section>
      </main>

      <footer className="site-footer"><div className="container footer-inner"><span className="logo footer-logo"><span className="logo-mark"><Icon name="feather" size={14}/></span>Aviary</span><p>A bird identification prototype using your trained model.</p><span>COS30082 · Computer vision</span></div></footer>
    </div>
  );
}

export default App;
