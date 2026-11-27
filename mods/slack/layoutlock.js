// 레이아웃을 바꾸는 일(채팅/터미널 보기, 오른쪽 패널)을 한 줄로 세운다. layout.set 은 트리 전체를 덮어쓰므로,
// 한쪽이 읽어 둔 오래된 사본이 다른 쪽이 방금 고른 보기(예: 채팅 페이지)를 되돌리지 않게 한다.
// 같은 모드의 블록들(머리줄, 레일, 패널 탭 줄)이 함께 쓰도록 globalThis 에 둔다.
const lock = globalThis[Symbol.for("slack.layoutLock")] ??= { tail: Promise.resolve(), busy: 0 };

export const layoutBusy = () => lock.busy > 0;

export function withLayout(work) {
  lock.busy++;
  const run = lock.tail.then(work);
  lock.tail = run.catch(() => {}).finally(() => { lock.busy--; });
  return run;
}
