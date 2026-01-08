## 더미데이터 적용
<pre><code>docker exec -it gachimura-backend npm run seed</code></pre>

더미 데이터 추가/수정 필요할 경우 ``` /project-gachimura-backend-nest-deployment/src/database/seeds/create-initial-data.ts ``` 파일 수정

## 라이브러리 등 패키지 다운 후 적용 안될 때 
``` docker-compose up -d --build --renew-anon-volumes backend ``` 전 이미지 버리고 패키지 다운로드 된 버전으로 새로 만들어 씌우기

## swagger url 
``` http://localhost:8000/api-docs ```
