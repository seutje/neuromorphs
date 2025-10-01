import { mutateMorphGenome } from './morphMutation.js';
import { mutateControllerGenome } from './controllerMutation.js';
import { splitRng } from './rng.js';

export { mutateMorphGenome } from './morphMutation.js';
export { mutateControllerGenome } from './controllerMutation.js';

export function mutateCompositeGenome(individual, rng, config = {}) {
  const morphRng = splitRng(rng, `${individual?.id ?? 'individual'}-morph`);
  const controllerRng = splitRng(rng, `${individual?.id ?? 'individual'}-ctrl`);
  const morphResult = mutateMorphGenome(individual?.morph, morphRng, config.morph);
  const controllerResult = mutateControllerGenome(
    individual?.controller,
    controllerRng,
    config.controller
  );
  return {
    morph: morphResult.genome,
    controller: controllerResult.genome,
    operations: {
      morph: morphResult.operations,
      controller: controllerResult.operations
    }
  };
}
