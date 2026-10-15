# 친구와 공유하기

이 저장소의 게임은 정적 웹사이트로 게시할 수 있습니다. `index.html`에 코드, 그림, 글꼴이 포함되어 있어 별도 빌드 서버나 데이터베이스가 필요 없습니다.

## GitHub Pages

저장소 관리자가 GitHub의 **Settings → Pages**에서 다음을 설정합니다.

- Source: **Deploy from a branch**
- Branch: **main**, 폴더: **/ (root)**
- **Save**

GitHub Pages 배포가 완료되면 다음 주소를 공유합니다.

`https://gguriramen.github.io/gguri-s-ramenshop/`

이 주소는 Pages 기능이 활성화되고 첫 배포가 성공한 뒤에 작동합니다. 저장소에 파일을 올리는 것만으로 배포 성공을 의미하지 않습니다. GitHub Pages 제공 여부는 저장소 공개 범위와 계정 요금제에 따라 다르며, 저장소 공개 범위를 임의로 바꾸지 않습니다.

수정 후에는 `python3 bundle.py`와 `node --test engine.test.js`를 실행하고 변경된 파일을 main 브랜치에 올립니다.

모바일에서는 파일 미리보기가 아니라 게시된 HTTPS 주소를 일반 브라우저에서 엽니다. Pages 배포가 성공한 뒤에도 친구에게 공유하기 전에 첫 주문을 완성해 점수가 올라가는지 확인합니다.
