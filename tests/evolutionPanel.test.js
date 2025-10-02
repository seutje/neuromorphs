/**
 * @jest-environment jsdom
 */

import { createEvolutionPanel } from '../public/ui/evolutionPanel.js';

describe('createEvolutionPanel', () => {
  let form;
  let button;
  let progress;

  beforeEach(() => {
    document.body.innerHTML = `
      <form id="panel-form">
        <select name="startingModelId" id="starting-model">
          <option value="">Hopper (default)</option>
          <option value="alpha">Alpha</option>
        </select>
        <input name="seed" value="42" />
        <input name="populationSize" value="12" />
        <input name="generations" value="10" />
        <input name="selectionWeightDistance" value="0.5" />
        <input name="selectionWeightSpeed" value="1" />
        <input name="selectionWeightUpright" value="1" />
        <input name="morphAddLimbChance" value="0.35" />
        <input name="morphResizeChance" value="0.85" />
        <input name="morphJointJitterChance" value="0.65" />
        <input name="controllerWeightChance" value="0.85" />
        <input name="controllerOscillatorChance" value="0.6" />
        <input name="controllerAddConnectionChance" value="0.45" />
      </form>
      <button id="start-button" type="button">Start Evolution</button>
      <progress id="run-progress"></progress>
    `;
    form = document.querySelector('#panel-form');
    button = document.querySelector('#start-button');
    progress = document.querySelector('#run-progress');
    const startingField = form.elements.namedItem('startingModelId');
    Object.defineProperty(form, 'startingModelId', {
      value: startingField,
      configurable: true,
      writable: true
    });
  });

  it('returns null when Hopper baseline is selected', () => {
    const panel = createEvolutionPanel({ form, button, progress });
    const field = form.elements.namedItem('startingModelId');
    field.value = '';

    const config = panel.getConfig();

    expect(config.startingModelId).toBeNull();
  });

  it('returns the selected starting model id when provided', () => {
    const panel = createEvolutionPanel({ form, button, progress });
    const field = form.elements.namedItem('startingModelId');
    field.value = 'alpha';

    const config = panel.getConfig();

    expect(config.startingModelId).toBe('alpha');
  });
});
