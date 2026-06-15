import { User } from './entities/user.entity';

export function toPublicUser(user?: User | null) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    nickname: user.nickname,
    nickname_jp: user.nickname_jp,
    profileImage: user.profileImage,
    treeScore: user.treeScore,
    reviewsCount: user.reviewsCount,
  };
}
