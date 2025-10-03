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
import { applyGroundClearance } from './grounding.js';

export function instantiateCreature(RAPIER, world, morphGenome, controllerGenome) {
  const morph = morphGenome ?? createDefaultMorphGenome();
  const morphBlueprint = buildMorphologyBlueprint(morph);
  if (morphBlueprint.errors.length > 0) {
    throw new Error(`Failed to build morph: ${morphBlueprint.errors.join('; ')}`);
  }

  const bodyOrder = [];
  const bodies = new Map();

  const descriptors = morphBlueprint.bodies.map((body) => ({
    id: body.id,
    translation: [...body.translation],
    rotation: [...body.rotation],
    halfExtents: [...body.halfExtents],
    density: body.density,
    material: body.material,
    linearDamping: body.linearDamping,
    angularDamping: body.angularDamping
  }));

  applyGroundClearance(descriptors);

  descriptors.forEach((descriptor) => {
    const rigidBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(
          descriptor.translation[0],
          descriptor.translation[1],
          descriptor.translation[2]
        )
        .setRotation({
          x: descriptor.rotation[0],
          y: descriptor.rotation[1],
          z: descriptor.rotation[2],
          w: descriptor.rotation[3]
        })
        .setLinearDamping(descriptor.linearDamping ?? 0.05)
        .setAngularDamping(descriptor.angularDamping ?? 0.08)
    );
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        descriptor.halfExtents[0],
        descriptor.halfExtents[1],
        descriptor.halfExtents[2]
      )
        .setDensity(descriptor.density ?? 1)
        .setFriction(descriptor.material?.friction ?? 0.9)
        .setRestitution(descriptor.material?.restitution ?? 0.2)
        .setCollisionGroups(COLLISION_GROUP_CREATURE),
      rigidBody
    );

    bodies.set(descriptor.id, {
      body: rigidBody,
      collider,
      halfExtents: [...descriptor.halfExtents]
    });
    bodyOrder.push(descriptor.id);
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
