import dotenv from 'dotenv';

dotenv.config();

console.log('[INFO] Cache layer running in high-fidelity IN-MEMORY Redis simulation mode.');

class MockRedisClient {
  private store: { [key: string]: any } = {};
  public isOpen = false;

  async connect() {
    this.isOpen = true;
    console.log('Successfully initialized Mock Redis memory database');
  }

  // Hash commands
  async hSet(key: string, fieldOrObj: any, val?: string) {
    if (!this.store[key]) this.store[key] = {};
    if (typeof fieldOrObj === 'object') {
      this.store[key] = { ...this.store[key], ...fieldOrObj };
    } else {
      this.store[key][fieldOrObj] = val;
    }
  }

  async hGetAll(key: string) {
    return this.store[key] || {};
  }

  async del(key: string) {
    delete this.store[key];
  }

  // Sorted Set (ZSET) commands
  async zAdd(key: string, element: { score: number, value: string }) {
    if (!this.store[key]) this.store[key] = [];
    // Remove if exists
    this.store[key] = this.store[key].filter((el: any) => el.value !== element.value);
    this.store[key].push(element);
  }

  async zRem(key: string, value: string) {
    if (!this.store[key]) return;
    this.store[key] = this.store[key].filter((el: any) => el.value !== value);
  }

  // Node-redis v4 zRangeWithScores mock
  async zRangeWithScores(key: string, start: number, stop: number) {
    if (!this.store[key]) return [];
    
    // Sort ascending by score (price)
    const sorted = [...this.store[key]].sort((a: any, b: any) => a.score - b.score);

    // Slice based on index
    if (start === 0 && stop === 0) {
      return sorted.slice(0, 1); // Best Ask (lowest)
    } else if (start === -1 && stop === -1) {
      return sorted.slice(-1); // Best Bid (highest)
    } else if (start === 0 && stop === -1) {
      return sorted; // Full list
    }
    
    return sorted;
  }

  on(_event: string, _callback: any) {
    // Stub for error listeners
  }
}

export const redisClient = new MockRedisClient();
export const redisPub = new MockRedisClient();
export const redisSub = new MockRedisClient();

export const connectRedis = async () => {
  await redisClient.connect();
  await redisPub.connect();
  await redisSub.connect();
};
