# DB 변경 및 CORS

- 로컬 DB만 Docker로 켜고, 프론트·백엔드는 npm으로 실행해도 됩니다.
- `DB_SYNCHRONIZE=false`가 기본입니다. 운영에서는 true로 적어도 자동 스키마 변경을 허용하지 않습니다.
- 빈 DB: `npm run migration:run` 후 서버를 켭니다. 운영 이미지에서는 `npx typeorm -d dist/database/data-source.js migration:run`을 사용합니다.
- **기존 DB/AWS에는 바로 실행하지 마세요.** 첫 마이그레이션은 빈 DB용입니다. 먼저 백업·복제 DB에서 실제 스키마와 초기 마이그레이션을 비교하고, 일치한 경우에만 초기 이력 등록을 진행해야 합니다. `--fake`를 전체 마이그레이션에 적용하면 필요한 변경까지 누락됩니다.
- 새 변경은 `npm run migration:generate -- <추가 옵션>` 대신 `npm run typeorm -- migration:generate src/database/migrations/변경이름`으로 만듭니다. 생성된 SQL을 확인하고 복제 DB에서 검증합니다.
- 운영 DB 작업은 AWS 담당자와 별도 배포 단계로 진행합니다. 이 작업에서 운영 DB는 변경하지 않았습니다.

`CORS_ORIGINS=http://localhost:3000`처럼 허용할 프론트 주소를 정확히 지정합니다. 여러 주소는 쉼표로 구분합니다. URL 경로나 끝의 `/`는 넣지 않습니다. 프론트 포트가 3101이면 `http://localhost:3101`도 지정해야 합니다.

비밀번호 재설정 PR은 이 마이그레이션 기반이 반영된 다음 배포합니다. 운영에서 `PASSWORD_RESET_URL`은 실제 HTTPS 프론트의 `/reset-password` 주소를 지정해야 합니다.
