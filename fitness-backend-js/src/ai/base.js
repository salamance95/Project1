/**
 * 코칭 모델 공통 인터페이스.
 * 모델을 갈아끼워도 호출부(routes)는 그대로여야 한다.
 */

export class CoachModel {
  static key = "base";
  static label = "기본";
  static provider = "none";
  static description = "";

  get key() {
    return this.constructor.key;
  }

  get label() {
    return this.constructor.label;
  }

  get provider() {
    return this.constructor.provider;
  }

  /** 지금 이 모델을 쓸 수 있는가(패키지 설치, 자격 증명 등). */
  available() {
    throw new Error("not implemented");
  }

  unavailableReason() {
    return "";
  }

  async generate() {
    throw new Error("not implemented");
  }

  async searchExercises() {
    throw new Error("not implemented");
  }

  async analyzeMealPhoto() {
    throw new Error("not implemented");
  }

  async analyzeBodyPhoto() {
    throw new Error("not implemented");
  }

  async buildPlaylist() {
    throw new Error("not implemented");
  }

  info() {
    const ok = this.available();
    return {
      key: this.key,
      label: this.label,
      provider: this.provider,
      description: this.constructor.description,
      available: ok,
      reason: ok ? "" : this.unavailableReason(),
    };
  }
}
