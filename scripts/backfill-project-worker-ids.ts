import { Logger } from '@nestjs/common';
import * as mongoose from 'mongoose';
import { MONGODB_URI } from './load-env';

async function bootstrap() {
  const logger = new Logger('BackfillProjectWorkerIds');

  try {
    await mongoose.connect(MONGODB_URI);
    logger.log('Подключение к MongoDB');

    const projectSchema = new mongoose.Schema(
      { workers: [String] },
      { strict: false },
    );
    const userSchema = new mongoose.Schema(
      { projectIds: [String] },
      { strict: false },
    );

    const Project = mongoose.model('Project', projectSchema);
    const User = mongoose.model('User', userSchema);

    const projects = await Project.find({}).select('_id workers');

    let updatedUsers = 0;
    let checkedPairs = 0;

    for (const project of projects) {
      const projectId = String(project._id);
      const workerIds = (project.workers || []).map((id) => String(id));

      for (const workerId of workerIds) {
        checkedPairs++;

        const result = await User.updateOne(
          { _id: workerId, projectIds: { $ne: projectId } },
          { $push: { projectIds: projectId } },
        );

        if (result.modifiedCount > 0) {
          updatedUsers++;
          logger.log(`+ Добавлен projectId ${projectId} пользователю ${workerId}`);
        }
      }
    }

    logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.log(`| Проектов проверено: ${projects.length}`);
    logger.log(`| Пар project/worker проверено: ${checkedPairs}`);
    logger.log(`+ Пользователей обновлено: ${updatedUsers}`);
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
