import { parseReceiptText } from './receipt-parser';

describe('parseReceiptText', () => {
  it('한국 영수증의 상호명, 품목, 수량, 단가와 합계를 추출한다', () => {
    const result = parseReceiptText(`
      가치마트 강남점
      서울특별시 강남구 테헤란로 1
      사업자번호 123-45-67890
      우유 1,500
      사과 2개 1,000 2,000
      부가세 318
      결제금액 3,500
    `);

    expect(result).toEqual({
      storeName: '가치마트 강남점',
      items: [
        { name: '우유', price: 1500, quantity: 1 },
        { name: '사과', price: 1000, quantity: 2 },
      ],
      totalPrice: 3500,
    });
  });

  it('문자 수와 관계없이 인식된 각 행에서 품목을 추출한다', () => {
    const result = parseReceiptText(`
      CAFE GACHI
      아메리카노 4,500
      카페라떼 5,000
      TOTAL 9,500
    `);

    expect(result.storeName).toBe('CAFE GACHI');
    expect(result.items).toEqual([
      { name: '아메리카노', price: 4500, quantity: 1 },
      { name: '카페라떼', price: 5000, quantity: 1 },
    ]);
    expect(result.totalPrice).toBe(9500);
  });

  it('세븐일레븐 영수증의 여러 줄 품목과 붙어서 인식된 수량·가격을 보정한다', () => {
    const result = parseReceiptText(`
      세계 1등 편의점
      (주)리아
      www.7 eleven co kr
      세븐일레븐
      문정수정점#18308
      (02-400-6307)
      최경호
      2158544631
      서울특별시 송파구 동남로 8길 12
      (문정동)
      현금(자진발급)」
      용
      [판매] 2020-06-09 (화) 20:59:47
      상품명
      수량
      금액
      8809599360081
      라라스윗) 바닐라파인트474
      1
      행사
      6,900
      라라스윗) 조코파인트474ml
      행사
      8809599360104
      16,900
      비닐봉투 보증금 20원
      *1171798100209
      20
      과세물품가액
      12.545
      1,255
      봉투보증금액
      20
      ₩13,820
      20
    `);

    expect(result).toEqual({
      storeName: '문정수정점',
      items: [
        { name: '라라스윗) 바닐라파인트', price: 6900, quantity: 1 },
        { name: '라라스윗) 조코파인트', price: 6900, quantity: 1 },
      ],
      totalPrice: 13820,
    });
  });

  it('GS25 영수증의 좌표 기반 행에서 상품만 추출한다', () => {
    const coordinateLines = [
      '가까운 행복 을 만나다 GS25',
      'GS25 포곡 골든 점 8313321182',
      '박지훈 6380988924',
      '경기 용인시 처인구 포곡읍 전대 로',
      '78 번길 19- 2. GS25',
      '2821/10/31 김숙 NO : 14522',
      '* 정부 방침 에 의해 교환 / 환불 은',
      '반드시 영수증 을 지참 하셔야 하며 ,',
      '카드 결제 는 38 일 ( 11 월 38 일 ) 이내',
      '카드 와 영수증 지참 시 가능 합니다 .',
      '마늘 빅 프랑크 2,100',
      '예 거라 들러 레몬 3,300',
      '마운틴 블러 스트 2,100',
      '합계 수량 / 금액 7,588',
      '판촉 / 팝 할인 -428',
      '과세 매출 6,436',
      '부가세 644',
      '계 7,888',
      '신용 카드 7,888',
      'GS & POINT 적립 내역',
      '사용 금액 7,880 원',
      '승인 번호 21/10/31 30037844 22:23:19',
    ];

    const result = parseReceiptText('읽기 순서가 섞인 원문', coordinateLines);

    expect(result.storeName).toBe('GS25 포곡 골든 점');
    expect(result.items).toEqual([
      { name: '마늘 빅 프랑크', price: 2100, quantity: 1 },
      { name: '예 거라 들러 레몬', price: 3300, quantity: 1 },
      { name: '마운틴 블러 스트', price: 2100, quantity: 1 },
    ]);
    expect(result.totalPrice).toBe(7588);
  });
});
