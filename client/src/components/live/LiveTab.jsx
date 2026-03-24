import { useSocket } from "../../context/SocketContext";
import Controls from "./Controls";
import Transcript from "./Transcript";
import PartialResult from "./PartialResult";

export default function LiveTab() {
  const { state } = useSocket();

  return (
    <>
      <Controls />
      <Transcript utterances={state.utterances} speakerColorMap={state.speakerColorMap} />
      <PartialResult data={state.partialResult} />
    </>
  );
}
