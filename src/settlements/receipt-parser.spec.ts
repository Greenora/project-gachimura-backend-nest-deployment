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

  it('여러 줄 품목의 규격을 보존하고 합계에 맞춰 불확실한 가격을 추측하지 않는다', () => {
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
      items: [{ name: '라라스윗) 바닐라파인트474', price: 6900, quantity: 1 }],
      totalPrice: 13820,
    });
  });

  it('명확히 분리된 여러 줄 수량·금액과 상품 규격을 보존한다', () => {
    const result = parseReceiptText(`
      예시 편의점
      상품명 수량 금액
      8800000000001
      라라스윗) 바닐라파인트474
      1 6,900
      8800000000002
      라라스윗) 조코파인트474ml
      1 6,900
      합계 13,800
    `);

    expect(result.items).toEqual([
      { name: '라라스윗) 바닐라파인트474', price: 6900, quantity: 1 },
      { name: '라라스윗) 조코파인트474ml', price: 6900, quantity: 1 },
    ]);
    expect(result.totalPrice).toBe(13800);
  });

  it('띄어진 표 제목을 인식하고 직원 정보·세금·받을 금액을 품목에서 제외한다', () => {
    const result = parseReceiptText(`
      예시 농협마트
      예시직원 0008
      상 품 명 수 량 단 가 금 액
      우유 1 1,500 1,500
      사과 2 1,000 2,000
      부 가 세 318
      받 을 금 액 3,500
      예시직원 4321
    `);

    expect(result.items).toEqual([
      { name: '우유', price: 1500, quantity: 1 },
      { name: '사과', price: 1000, quantity: 2 },
    ]);
    expect(result.totalPrice).toBe(3500);
  });

  it('여러 줄 세금·결제 영역의 숫자를 앞선 미완성 상품명에 붙이지 않는다', () => {
    const result = parseReceiptText(`
      예시마트
      상품명 수량 금액
      우유
      1
      1,500
      확인되지 않은 행
      부 가 세
      136
      받을 금액
      1,500
    `);

    expect(result.items).toEqual([{ name: '우유', price: 1500, quantity: 1 }]);
    expect(result.totalPrice).toBe(1500);
  });

  it('표 제목이 없어도 직원번호·연락처·일시와 합계 이후 안내를 제외한다', () => {
    const result = parseReceiptText(`
      예시마트
      직원명 0008
      전화 010-0000-0000
      판매일시 2026/11/11 13:30:00
      우유 1,500
      부 가 세 136
      받을 금액 1,500
      예시직원 4321
    `);

    expect(result.items).toEqual([{ name: '우유', price: 1500, quantity: 1 }]);
    expect(result.totalPrice).toBe(1500);
  });

  it.each([
    ['상품명 단가 수량 금액', '우유 1,500 2 3,000'],
    ['상품명 수량 단가 금액', '우유 2 1,500 3,000'],
    ['상품명 수량 금액', '우유 2 3,000'],
  ])('%s의 열 의미에 맞게 수량과 단가를 추출한다', (header, row) => {
    const result = parseReceiptText(`예시마트\n${header}\n${row}\n합계 3,000`);

    expect(result.items).toEqual([{ name: '우유', price: 1500, quantity: 2 }]);
    expect(
      result.items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    ).toBe(3000);
  });

  it('단가인지 행 합계인지 불확실한 수량 금액을 추측해 늘리지 않는다', () => {
    const result = parseReceiptText('예시마트\n우유 2개 3,000\n합계 3,000');

    expect(result.items).toEqual([]);
    expect(result.totalPrice).toBe(3000);
  });

  it('표시 단가와 달라도 명시된 행 금액과 수량으로 실제 청구 단가를 계산한다', () => {
    const result = parseReceiptText(`
      예시마트
      상품명 단가 수량 금액
      우유 1,500 2 2,900
      합계 2,900
    `);

    expect(result.items).toEqual([{ name: '우유', price: 1450, quantity: 2 }]);
    expect(result.totalPrice).toBe(2900);
  });

  it('행 금액을 수량으로 정확하게 나눌 수 없으면 금액을 반올림하지 않는다', () => {
    expect(
      parseReceiptText(
        '예시마트\n상품명 단가 수량 금액\n우유 1,500 3 2,900\n합계 2,900',
      ).items,
    ).toEqual([]);
  });

  it('상품명의 모델 번호·용량을 가격이나 수량으로 잘라내지 않는다', () => {
    const result = parseReceiptText(`
      예시마트
      상품명 금액
      마스크 KF94 1,500
      생수 500ml 1,000
      비타민C1000 2,000
      합계 4,500
    `);

    expect(result.items).toEqual([
      { name: '마스크 KF94', price: 1500, quantity: 1 },
      { name: '생수 500ml', price: 1000, quantity: 1 },
      { name: '비타민C1000', price: 2000, quantity: 1 },
    ]);
  });

  it('상품명 옆 수량과 다음 줄 금액도 같은 표의 열에 맞춰 처리한다', () => {
    const result = parseReceiptText(
      '예시마트\n상품명 수량 금액\n우유 2\n3,000\n합계 3,000',
    );
    expect(result.items).toEqual([{ name: '우유', price: 1500, quantity: 2 }]);
  });

  it('깨진 쉼표나 식별 번호를 숫자만 이어 붙여 금액으로 만들지 않는다', () => {
    const result = parseReceiptText(
      '예시마트\n직원명 0008\n전화 010-0000-0000\n우유 1,5002\n마스크 1,00\n생수 1,000\n합계 1,000',
    );
    expect(result.items).toEqual([{ name: '생수', price: 1000, quantity: 1 }]);
  });

  it('카드 결제 안내 뒤 직원명을 다시 상품으로 읽지 않는다', () => {
    const result = parseReceiptText(
      '예시마트\n상품명 금액\n우유 1,500\n카드 결제 1,500\n예시직원 4321',
    );
    expect(result.items).toEqual([{ name: '우유', price: 1500, quantity: 1 }]);
  });

  it.each(['우유 2원 3,000개', '우유 ₩2 3,000'])(
    '수량·금액 열의 단위가 모순된 %s는 금액으로 변환하지 않는다',
    (row) => {
      expect(
        parseReceiptText(`예시마트\n상품명 수량 금액\n${row}\n합계 3,000`)
          .items,
      ).toEqual([]);
    },
  );

  it('메타데이터 단어가 일부 포함된 실제 상품은 제외하지 않는다', () => {
    const result = parseReceiptText(`
      예시마트
      상품명 금액
      카드지갑 5,000
      전화기 8,000
      할인우유 1,500
      합계 14,500
    `);

    expect(result.items).toEqual([
      { name: '카드지갑', price: 5000, quantity: 1 },
      { name: '전화기', price: 8000, quantity: 1 },
      { name: '할인우유', price: 1500, quantity: 1 },
    ]);
  });

  it('영수증의 별표만 제거하고 숫자 브랜드·모델·용량·상품명 기호는 보존한다', () => {
    const result = parseReceiptText(`
      예시마트
      상품명 금액
      365 우유 1,500
      * 한끼에 하나씩 양상추 4,980
      ＊ 마스크 KF94 1,500
      생 삼치 (20S) 3,400
      어린 잎 & 믹스 채소 3,580
      합계 14,960
    `);

    expect(result.items).toEqual([
      { name: '365 우유', price: 1500, quantity: 1 },
      { name: '한끼에 하나씩 양상추', price: 4980, quantity: 1 },
      { name: '마스크 KF94', price: 1500, quantity: 1 },
      { name: '생 삼치 (20S)', price: 3400, quantity: 1 },
      { name: '어린 잎 & 믹스 채소', price: 3580, quantity: 1 },
    ]);
  });

  it('번호 열이 명시된 경우에만 상품명 앞의 행 번호를 제거한다', () => {
    const result = parseReceiptText(`
      예시마트
      번호 상품명 금액
      01 365 우유 1,500
      *02 마스크 KF94 1,500
      합계 3,000
    `);

    expect(result.items).toEqual([
      { name: '365 우유', price: 1500, quantity: 1 },
      { name: '마스크 KF94', price: 1500, quantity: 1 },
    ]);
  });

  it('이름·받을 금액·띄어진 부가세를 작은 금액의 품목으로 만들지 않는다', () => {
    expect(
      parseReceiptText(`
      예시마트
      예시이름 00085
      받을 금액: 8. 560
      부 가 세 125
    `).items,
    ).toEqual([]);
  });

  it('전각 별표가 붙은 세금 안내에서도 상품 영역을 종료한다', () => {
    expect(
      parseReceiptText(`
      예시마트
      상품명 금액
      * 365 우유 1,500
      ＊ 부 가 세 136
      예시직원 4321
    `).items,
    ).toEqual([{ name: '365 우유', price: 1500, quantity: 1 }]);
  });

  it('제공된 영수증의 01~07 행과 세금 표시를 구분해 일곱 품목의 금액을 보존한다', () => {
    const result = parseReceiptText(`
      예시마트
      상품명 단가 수량 금액
      01 깐띠 모스카토 750m 9,800 1 9,800
      02 믹스 보드카700ml 6,980 1 6,980
      03* 생삼치(20S) 3,400 1 3,400
      04* ( 990 ) 깐마늘 990 1 990
      05* (990)태양파 990 1 990
      06* 어린잎&믹스채소 3,580 1 3,580
      07 * 한끼에하나씩양상추 4,980 1 4,980
      합계 30,720
    `);

    expect(result.items).toEqual([
      { name: '깐띠 모스카토 750m', price: 9800, quantity: 1 },
      { name: '믹스 보드카700ml', price: 6980, quantity: 1 },
      { name: '생삼치(20S)', price: 3400, quantity: 1 },
      { name: '깐마늘', price: 990, quantity: 1 },
      { name: '태양파', price: 990, quantity: 1 },
      { name: '어린잎&믹스채소', price: 3580, quantity: 1 },
      { name: '한끼에하나씩양상추', price: 4980, quantity: 1 },
    ]);
    expect(
      result.items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    ).toBe(30720);
    expect(result.totalPrice).toBe(30720);
  });

  it('연속 행 번호로 확인되지 않은 숫자 상품명은 지우지 않는다', () => {
    expect(
      parseReceiptText(`
      예시마트
      상품명 금액
      01 우유 1,500
      03 마스크 KF94 1,500
      합계 3,000
    `).items,
    ).toEqual([
      { name: '01 우유', price: 1500, quantity: 1 },
      { name: '03 마스크 KF94', price: 1500, quantity: 1 },
    ]);
  });

  it('상품명의 괄호 숫자가 단가와 다르면 가격 접두어로 지우지 않는다', () => {
    expect(
      parseReceiptText(`
      예시마트
      상품명 금액
      (990) 마스크 KF94 1,500
      합계 1,500
    `).items,
    ).toEqual([{ name: '(990) 마스크 KF94', price: 1500, quantity: 1 }]);
  });

  it('좌표 행의 세금이 합계에 섞여도 원문의 명시된 결제대상금액을 사용한다', () => {
    const result = parseReceiptText(
      '예시마트\n부가세\n1,525\n합\n계\n30,720\n결제대상금액\n30,720',
      [
        '예시마트',
        '상품명 금액',
        '우유 30,720',
        '부가세 15,255',
        '합 계 1,525',
        '결제 대상 금액',
      ],
    );
    expect(result.totalPrice).toBe(30720);
  });

  it('원문의 라벨 없는 통화 금액보다 좌표 행의 명시된 결제금액을 우선한다', () => {
    expect(
      parseReceiptText('예시마트\n₩900', [
        '예시마트',
        '우유 1,000',
        '결제금액 1,000',
      ]).totalPrice,
    ).toBe(1000);
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
