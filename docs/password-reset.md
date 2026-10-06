# 비밀번호 재설정

- 요청: `POST /api/auth/password-reset/request` (`email`)
- 변경: `POST /api/auth/password-reset/confirm` (`token`, `password`)
- 링크는 15분 동안 한 번만 사용 가능하며 DB에는 토큰 해시만 저장합니다.
- 계정 유무와 관계없이 같은 요청 응답을 반환합니다. IP별 요청 제한과 계정별 1분 재전송 제한이 있습니다.
- 비밀번호 변경 후 기존 Refresh Token은 사용할 수 없습니다. 기존 Access Token은 만료(최대 1시간)까지 남을 수 있습니다.
- 개발 모드 이메일 인증 우회는 **회원가입만** 해당합니다. 비밀번호 재설정은 반드시 메일 링크를 확인합니다.

## 설정

서버 환경변수에 `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `PASSWORD_RESET_URL`을 설정합니다. 인증이 필요한 메일 서비스는 `SMTP_USER`, `SMTP_PASS`도 설정합니다. 운영 `PASSWORD_RESET_URL`은 HTTPS 프론트의 `/reset-password` 주소여야 합니다.

로컬 테스트는 Mailpit SMTP 1026 / 웹 8026을 사용할 수 있습니다. 실제 Gmail로 메일을 보내지 않습니다. 외부 메일 발송과 AWS 배포는 별도 SMTP 설정 이후 확인해야 합니다.

## DB 배포 순서

DB migration/CORS PR을 먼저 병합한 후 `PasswordReset1790100000000`을 적용합니다. 기존 DB는 초기 스키마 이력 점검과 백업이 먼저입니다. `synchronize=true`로 자동 변경하는 운영 배포는 하지 않습니다.

## 테스트

`npm test -- --runInBand`로 단위 테스트를 실행합니다.

`AUTH_TEST_ENV_FILE=/안전한/로컬/.env node test/password-reset.integration.cjs`는 localhost MySQL에만 접속하여 임시 DB를 만들고 삭제합니다. Mailpit이 필요하며 기존 사용자 DB는 변경하지 않습니다. 초기 마이그레이션 PR을 아직 병합하지 않았다면 `BASELINE_MIGRATION_PATH`로 해당 파일의 절대 경로를 지정합니다.
