import {
  ARENA_FLOOR_Y,
  ARENA_HALF_EXTENTS,
  OBJECTIVE_HALF_EXTENTS,
  OBJECTIVE_POSITION
} from '../../environment/arena.js';
import { COLLISION_GROUP_ENVIRONMENT } from './common.js';

export function createSimulationWorld(RAPIER, timestep) {
  const gravity = new RAPIER.Vector3(0, -9.81, 0);
  const world = new RAPIER.World(gravity);
  world.timestep = timestep;

  const floor = RAPIER.ColliderDesc.cuboid(
    ARENA_HALF_EXTENTS.x,
    ARENA_HALF_EXTENTS.y,
    ARENA_HALF_EXTENTS.z
  )
    .setTranslation(0, ARENA_FLOOR_Y, 0)
    .setCollisionGroups(COLLISION_GROUP_ENVIRONMENT);
  world.createCollider(floor);

  const objective = RAPIER.ColliderDesc.cuboid(
    OBJECTIVE_HALF_EXTENTS.x,
    OBJECTIVE_HALF_EXTENTS.y,
    OBJECTIVE_HALF_EXTENTS.z
  )
    .setTranslation(OBJECTIVE_POSITION.x, OBJECTIVE_POSITION.y, OBJECTIVE_POSITION.z)
    .setCollisionGroups(COLLISION_GROUP_ENVIRONMENT);
  world.createCollider(objective);

  return world;
}
