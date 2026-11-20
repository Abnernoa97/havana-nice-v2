import {usePwaChatController} from '../features/chat/usePwaChatController';
import PwaChatSurface from '../features/chat/PwaChatSurface';

// One app entry, one controller; visual modules remain independent.
export default function App(){
  const ui=usePwaChatController();
  return <PwaChatSurface ui={ui}/>;
}
