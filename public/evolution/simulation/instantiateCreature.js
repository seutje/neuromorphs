import {
  buildMorphologyBlueprint,
  createDefaultMorphGenome
} from '../../../genomes/morphGenome.js';
import {
  buildControllerBlueprint,
  createDefaultControllerGenome
} from '../../../genomes/ctrlGenome.js';
import { createControllerRuntime } from '../../../workers/controllerRuntime.js';
import { COLLISION_GROUP_CREATURE } from './common.js';

export function instantiateCreature(RAPIER, world, morphGenome, controllerGenome) {
  const morph = morphGenome ?? createDefaultMorphGenome();
  const morphBlueprint = buildMorphologyBlueprint(morph);
  if (morphBlueprint.errors.length > 0) {
    throw new Error(`Failed to build morph: ${morphBlueprint.errors.join('; ')}`);
  }

  const bodyOrder = [];
  const bodies = new Map();

  morphBlueprint.bodies.forEach((body) => {
    const translation = body.translation;
    const rotation = body.rotation;
    const rigidBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(translation[0], translation[1], translation[2])
        .setRotation({ x: rotation[0], y: rotation[1], z: rotation[2], w: rotation[3] })
        .setLinearDamping(body.linearDamping ?? 0.05)
        .setAngularDamping(body.angularDamping ?? 0.08)
    );
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        body.halfExtents[0],
        body.halfExtents[1],
        body.halfExtents[2]
      )
        .setDensity(body.density ?? 1)
        .setFriction(body.material?.friction ?? 0.9)
        .setRestitution(body.material?.restitution ?? 0.2)
        .setCollisionGroups(COLLISION_GROUP_CREATURE),
      rigidBody
    );

    bodies.set(body.id, {
      body: rigidBody,
      collider,
      halfExtents: [...body.halfExtents]
    });
    bodyOrder.push(body.id);
  });

  const jointDescriptors = [];
  const jointMap = new Map();

  morphBlueprint.joints.forEach((jointDef) => {
    const parentEntry = bodies.get(jointDef.parentId);
    const childEntry = bodies.get(jointDef.childId);
    if (!parentEntry || !childEntry) {
      return;
    }
    const parentAnchor = {
      x: jointDef.parentAnchor[0],
      y: jointDef.parentAnchor[1],
      z: jointDef.parentAnchor[2]
    };
    const childAnchor = {
      x: jointDef.childAnchor[0],
      y: jointDef.childAnchor[1],
      z: jointDef.childAnchor[2]
    };

    let jointData;
    if (jointDef.type === 'fixed') {
      jointData = RAPIER.JointData.fixed(
        parentAnchor,
        childAnchor,
        { x: 0, y: 0, z: 0, w: 1 },
        { x: 0, y: 0, z: 0, w: 1 }
      );
    } else if (jointDef.type === 'spherical') {
      jointData = RAPIER.JointData.spherical(parentAnchor, childAnchor);
    } else {
      const axis = {
        x: jointDef.axis[0],
        y: jointDef.axis[1],
        z: jointDef.axis[2]
      };
      jointData = RAPIER.JointData.revolute(parentAnchor, childAnchor, axis);
    }

    const jointHandle = world.createImpulseJoint(
      jointData,
      parentEntry.body,
      childEntry.body,
      true
    );

    if (jointDef.limits && jointHandle && typeof jointHandle.setLimits === 'function') {
      try {
        jointHandle.setLimits(jointDef.limits[0], jointDef.limits[1]);
      } catch (_error) {
        // Invalid limits can be ignored; Rapier clamps internally when possible.
      }
    }

    const descriptor = {
      id: jointDef.id,
      parentId: jointDef.parentId,
      childId: jointDef.childId,
      axis: [...jointDef.axis],
      limits: jointDef.limits ? [...jointDef.limits] : null,
      handle: jointHandle
    };
    jointDescriptors.push(descriptor);
    jointMap.set(descriptor.id, descriptor);
  });

  const controllerSource = controllerGenome ?? createDefaultControllerGenome();
  const controllerBlueprint = buildControllerBlueprint(controllerSource);
  if (controllerBlueprint.errors.length > 0) {
    throw new Error(`Failed to build controller: ${controllerBlueprint.errors.join('; ')}`);
  }
  const controllerRuntime = createControllerRuntime(controllerBlueprint);
  if (!controllerRuntime) {
    throw new Error('Controller runtime failed to initialize.');
  }

  return {
    bodies,
    bodyOrder,
    jointDescriptors,
    jointMap,
    controllerRuntime,
    rootId: bodyOrder[0] ?? null
  };
}
