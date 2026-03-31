import { Logger } from '@nestjs/common';
import * as mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';
import { MONGODB_URI } from './load-env';

async function bootstrap() {
  const logger = new Logger('CheckSuperAdmin');
  
  try {
    await mongoose.connect(MONGODB_URI);
    logger.log('Подключение к MongoDB установлено');
    
    const userSchema = new mongoose.Schema({
      email: String,
      password: { type: String, select: false },
      name: String,
      role: String,
      phoneAreaCode: Number,
      phoneNumber: Number,
    }, { timestamps: true });
    
    const User = mongoose.model('User', userSchema);
    
    const superAdmin = await User.findOne({ role: 'superadmin' }).select('+password');
    
    if (!superAdmin) {
      logger.log('SuperAdmin не найден!');
      await mongoose.disconnect();
      process.exit(0);
    }
    
    logger.log('Информация о SuperAdmin:');
    logger.log(`  Email: ${superAdmin.email}`);
    logger.log(`  Name: ${superAdmin.name}`);
    logger.log(`  Role: ${superAdmin.role}`);
    logger.log(`  Password (hash): ${superAdmin.password?.substring(0, 20)}...`);
    
    const isHashed = superAdmin.password?.startsWith('$2');
    logger.log(`  Пароль захеширован: ${isHashed ? '+ Да' : '- Нет'}`);
    
    await mongoose.disconnect();
    process.exit(0);
    
  } catch (error) {
    logger.error('Ошибка:', error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}

bootstrap();
