import BlockObject from 'game_components/object/block_object.js';
import InGameConfig from 'game_components/options/ingame_config';

const setBMSBlocks = (sceneManager, noteList) => {

  noteList.forEach(note => {
    sceneManager.addObject(makeGameBlock(note.type, note.time));
  });

}

const makeGameBlock = (type, time) => {
  const blockObject = new BlockObject(
    /* size */ InGameConfig.Block[type].size,
    /* color */ InGameConfig.Block[type].color,
    /* position */ {x : InGameConfig.Block[type].posX, y : time * 100, z : 0}
    );
  return blockObject;
}

export {setBMSBlocks, makeGameBlock}