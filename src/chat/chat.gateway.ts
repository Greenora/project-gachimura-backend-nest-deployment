import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

/*
  @WebSocketGateway
  - 이 클래스를 웹소켓 게이트웨이(기지국)로 만듬
  - cors 옵션: 프론트엔드(다른 주소, 지금은 3000이니 백엔드와 다름)에서 접속하는 것을 허락
*/
@WebSocketGateway({
  cors: {
    origin: '*', // "모든 주소에서 접속해도 된다" (나중에는 특정 주소로 제한해야 함)
    credentials: true,
  },
})
export class ChatGateway {
  // 현재 실행 중인 소켓 서버 인스턴스를 담는 변수
  // 이걸로 "전체 방송(emit)"을 할 수 있다
  @WebSocketServer()
  server: Server;

  /*
    - 프론트에서 'message'라는 이름으로 보낸 데이터만 여기서 받음
    - like 라디오 주파수 맞추기?
  */
  @SubscribeMessage('message')
  handleMessage(
    @MessageBody() data: string, // 프론트가 보낸 내용
    @ConnectedSocket() client: Socket // 메시지를 보낸 사람의연결 정보
  ): void {

    // 로그 찍기 (누가 뭘 보냈는지 서버 콘솔에서 확인용)
    console.log(`Client ${client.id} sent: ${data}`);

    /*
      핵심 기능: 브로드캐스팅 (Broadcasting)
      - this.server.emit: 나를 포함한 '접속한 모든 사람'에게 데이터를 보냄
      - 만약 client.emit을 쓰면 보낸 사람한테만 답장
    */
    this.server.emit('message', data);
  }
}