import { Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as mongoose from 'mongoose';
import { MONGODB_URI } from './load-env';

async function bootstrap() {
  const logger = new Logger('FixUserPasswords');
  
  try {
    await mongoose.connect(MONGODB_URI);
    logger.log('Подключение к MongoDB');
    
    const userSchema = new mongoose.Schema({
      email: String,
      password: String,
      name: String,
      role: String,
    }, { timestamps: true });
    
    const User = mongoose.model('User', userSchema);
    
    const users = await User.find({}).select('+password');
    
    let fixedCount = 0;
    let errorCount = 0;
    
    for (const user of users) {
      const password = user.password;
      
      const isHashed = password?.startsWith('$2');
      
      if (!isHashed && password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        user.password = hashedPassword;
        await user.save();
        
        logger.log(`+ Захеширован пароль для: ${user.email} (${user.role})`);
        fixedCount++;
      }
    }
    
    logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.log(`| Всего пользователей: ${users.length}`);
    logger.log(`+ Захешировано: ${fixedCount}`);
    logger.log(`- Ошибок: ${errorCount}`);
    logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    await mongoose.disconnect();
    process.exit(0);
    
  } catch (error) {
    logger.error('Ошибка:', error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}

bootstrap();
