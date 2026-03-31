import { Logger } from '@nestjs/common';
import * as mongoose from 'mongoose';
import { MONGODB_URI } from './load-env';

async function bootstrap() {
  const logger = new Logger('CheckAllPasswords');
  
  try {
    await mongoose.connect(MONGODB_URI);
    logger.log('Подключение к MongoDB установлено');
    
    const userSchema = new mongoose.Schema({
      email: String,
      password: { type: String, select: false },
      name: String,
      role: String,
    }, { timestamps: true });
    
    const User = mongoose.model('User', userSchema);
    
    const users = await User.find({}).select('+password');
    
    for (const user of users) {
      const isHashed = user.password?.startsWith('$2');
      const status = isHashed ? '+' : '-';
      const hashPreview = user.password?.substring(0, 20) + '...';
      
      logger.log(`${status} ${user.email} (${user.role})`);
      logger.log(`   Пароль: ${hashPreview}`);
      logger.log('');
    }
    
    const hashedCount = users.filter(u => u.password?.startsWith('$2')).length;
    const plainCount = users.length - hashedCount;
    
    logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.log(`| Итого: ${users.length} пользователей`);
    logger.log(`+ Захешировано: ${hashedCount}`);
    logger.log(`- В открытом виде: ${plainCount}`);
    logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    if (plainCount > 0) {
      logger.log('Запустите: npm run fix:passwords');
    }
    
    await mongoose.disconnect();
    process.exit(0);
    
  } catch (error) {
    logger.error('Ошибка:', error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}

bootstrap();
