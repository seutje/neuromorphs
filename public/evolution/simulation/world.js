import {
  ARENA_FLOOR_Y,
  ARENA_HALF_EXTENTS,
  OBJECTIVE_HALF_EXTENTS,
  OBJECTIVE_POSITION
} from '../../environment/arena.js';
import { DEFAULT_STAGE_ID, getStageDefinition } from '../../environment/stages.js';
import { enableContinuousCollisionDetection } from '../../physics/ccd.js';
import { configureCreatureSimulationWorld } from '../../physics/stability.js';
import { COLLISION_GROUP_ENVIRONMENT } from './common.js';

export function createSimulationWorld(RAPIER, timestep, stageId = DEFAULT_STAGE_ID) {
  const gravity = new RAPIER.Vector3(0, -9.81, 0);
  const world = new RAPIER.World(gravity);
  world.timestep = timestep;

  configureCreatureSimulationWorld(world);

  const floor = enableContinuousCollisionDetection(
    RAPIER.ColliderDesc.cuboid(
    ARENA_HALF_EXTENTS.x,
    ARENA_HALF_EXTENTS.y,
    ARENA_HALF_EXTENTS.z
    )
      .setTranslation(0, ARENA_FLOOR_Y, 0)
      .setCollisionGroups(COLLISION_GROUP_ENVIRONMENT)
  );
  world.createCollider(floor);

  const objective = enableContinuousCollisionDetection(
    RAPIER.ColliderDesc.cuboid(
    OBJECTIVE_HALF_EXTENTS.x,
    OBJECTIVE_HALF_EXTENTS.y,
    OBJECTIVE_HALF_EXTENTS.z
    )
      .setTranslation(OBJECTIVE_POSITION.x, OBJECTIVE_POSITION.y, OBJECTIVE_POSITION.z)
      .setCollisionGroups(COLLISION_GROUP_ENVIRONMENT)
  );
  world.createCollider(objective);

  const stage = getStageDefinition(stageId);
  if (stage && Array.isArray(stage.obstacles)) {
    stage.obstacles.forEach((obstacle) => {
      if (!obstacle || obstacle.type !== 'box') {
        return;
      }
      const halfExtents = obstacle.halfExtents ?? { x: 0.5, y: 0.5, z: 0.5 };
      const translation = obstacle.translation ?? { x: 0, y: 0, z: 0 };
      const collider = enableContinuousCollisionDetection(
        RAPIER.ColliderDesc.cuboid(
          halfExtents.x ?? 0.5,
          halfExtents.y ?? 0.5,
          halfExtents.z ?? 0.5
        )
          .setTranslation(
            translation.x ?? 0,
            translation.y ?? 0,
            translation.z ?? 0
          )
          .setCollisionGroups(COLLISION_GROUP_ENVIRONMENT)
      );
      world.createCollider(collider);
    });
  }

  return world;
}
