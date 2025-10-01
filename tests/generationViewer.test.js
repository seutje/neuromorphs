/**
 * @jest-environment jsdom
 */

import { createGenerationViewer } from '../public/ui/generationViewer.js';

function setupDom() {
  document.body.innerHTML = `
    <section id="generation-viewer" class="generation-viewer is-empty">
      <header class="generation-viewer__header">
        <div>
          <h3>Generation Viewer</h3>
          <p class="generation-viewer__subtitle">Testing</p>
        </div>
        <div class="generation-viewer__actions">
          <button id="generation-play" class="generation-viewer__button" type="button" disabled>
            Play
          </button>
          <button
            id="generation-latest"
            class="generation-viewer__button generation-viewer__button--ghost"
            type="button"
            disabled
          >
            Latest
          </button>
        </div>
      </header>
      <label for="generation-slider" class="generation-viewer__label">Scrub</label>
      <input
        id="generation-slider"
        class="generation-viewer__slider"
        type="range"
        min="0"
        max="0"
        value="0"
        disabled
      />
      <div class="generation-summary">
        <div class="generation-summary__header">
          <p class="generation-summary__title">
            Generation <span id="generation-summary-generation">—</span>
          </p>
          <span id="generation-summary-count" class="generation-summary__count">0 / 0</span>
        </div>
        <p class="generation-summary__fitness">
          Best fitness <span id="generation-summary-best">—</span>
        </p>
        <dl class="generation-summary__metrics">
          <div><dt>Mean</dt><dd id="generation-summary-mean">—</dd></div>
          <div><dt>Disp</dt><dd id="generation-summary-displacement">—</dd></div>
          <div><dt>Speed</dt><dd id="generation-summary-speed">—</dd></div>
          <div><dt>Height</dt><dd id="generation-summary-height">—</dd></div>
          <div><dt>Upright</dt><dd id="generation-summary-upright">—</dd></div>
          <div><dt>Runtime</dt><dd id="generation-summary-runtime">—</dd></div>
        </dl>
      </div>
      <ol id="generation-timeline" class="generation-timeline"></ol>
      <p class="generation-viewer__empty">Empty</p>
    </section>
  `;

  const container = document.querySelector('#generation-viewer');
  const slider = document.querySelector('#generation-slider');
  const playButton = document.querySelector('#generation-play');
  const latestButton = document.querySelector('#generation-latest');
  const timeline = document.querySelector('#generation-timeline');
  const summary = {
    generation: document.querySelector('#generation-summary-generation'),
    count: document.querySelector('#generation-summary-count'),
    best: document.querySelector('#generation-summary-best'),
    mean: document.querySelector('#generation-summary-mean'),
    displacement: document.querySelector('#generation-summary-displacement'),
    speed: document.querySelector('#generation-summary-speed'),
    height: document.querySelector('#generation-summary-height'),
    upright: document.querySelector('#generation-summary-upright'),
    runtime: document.querySelector('#generation-summary-runtime')
  };

  const viewer = createGenerationViewer({
    container,
    slider,
    playButton,
    latestButton,
    summary,
    timeline
  });

  return {
    viewer,
    container,
    slider,
    playButton,
    latestButton,
    timeline,
    summary
  };
}

function createSampleEntry(overrides = {}) {
  return {
    generation: 0,
    bestFitness: 1.234,
    meanFitness: 0.8,
    bestMetrics: {
      displacement: 1.2,
      averageSpeed: 0.6,
      averageHeight: 0.9,
      fallFraction: 0.15,
      runtime: 3.5
    },
    ...overrides
  };
}

describe('createGenerationViewer', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('initializes in an empty state with controls disabled', () => {
    const { container, slider, playButton, latestButton } = setupDom();
    expect(container.classList.contains('is-empty')).toBe(true);
    expect(slider.disabled).toBe(true);
    expect(playButton.disabled).toBe(true);
    expect(latestButton.disabled).toBe(true);
  });

  it('adds generation entries and selects the latest by default', () => {
    const { viewer, container, slider, playButton, latestButton, summary, timeline } = setupDom();

    viewer.addGeneration(createSampleEntry({ generation: 0 }));

    expect(container.classList.contains('is-empty')).toBe(false);
    expect(slider.disabled).toBe(true);
    expect(summary.best.textContent).toBe('1.234');
    expect(summary.mean.textContent).toBe('0.800');
    expect(summary.displacement.textContent).toBe('1.20 m');
    expect(summary.speed.textContent).toBe('0.60 m/s');
    expect(summary.height.textContent).toBe('0.90 m');
    expect(summary.upright.textContent).toBe('85%');
    expect(summary.runtime.textContent).toBe('3.50 s');
    expect(timeline.children).toHaveLength(1);

    viewer.addGeneration(
      createSampleEntry({
        generation: 1,
        bestFitness: 2.5,
        meanFitness: 1.1,
        bestMetrics: {
          displacement: 2.1,
          averageSpeed: 1.1,
          averageHeight: 1.2,
          fallFraction: 0.05,
          runtime: 3.8
        }
      })
    );

    expect(slider.disabled).toBe(false);
    expect(slider.value).toBe('1');
    expect(playButton.disabled).toBe(false);
    expect(latestButton.disabled).toBe(true);
    expect(summary.best.textContent).toBe('2.500');
    expect(summary.displacement.textContent).toBe('2.10 m');
    expect(timeline.children).toHaveLength(2);
  });

  it('updates an existing generation without duplicating timeline items', () => {
    const { viewer, slider, summary, timeline } = setupDom();

    viewer.addGeneration(createSampleEntry({ generation: 0 }));
    viewer.addGeneration(
      createSampleEntry({ generation: 0, bestFitness: 3.21, meanFitness: 2.1 })
    );

    expect(timeline.children).toHaveLength(1);
    expect(slider.value).toBe('0');
    expect(summary.best.textContent).toBe('3.210');
    expect(summary.mean.textContent).toBe('2.100');
  });

  it('enables the latest button when scrubbing backwards', () => {
    const { viewer, slider, latestButton } = setupDom();

    viewer.addGeneration(createSampleEntry({ generation: 0 }));
    viewer.addGeneration(createSampleEntry({ generation: 1, bestFitness: 2 }));

    slider.value = '0';
    slider.dispatchEvent(new Event('input', { bubbles: true }));

    expect(slider.value).toBe('0');
    expect(latestButton.disabled).toBe(false);

    latestButton.click();

    expect(slider.value).toBe('1');
    expect(latestButton.disabled).toBe(true);
  });
});
