import { JobCommand, JobName, LoginResponseDto, updateConfig } from '@immich/sdk';
import { cpSync, rmSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { errorDto } from 'src/responses';
import { app, asBearerAuth, testAssetDir, utils } from 'src/utils';
import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

describe('/jobs', () => {
  let admin: LoginResponseDto;

  beforeAll(async () => {
    await utils.resetDatabase();
    admin = await utils.adminSetup({ onboarding: false });
  });

  describe('PUT /jobs', () => {
    afterEach(async () => {
      await utils.jobCommand(admin.accessToken, JobName.MetadataExtraction, {
        command: JobCommand.Resume,
        force: false,
      });

      await utils.jobCommand(admin.accessToken, JobName.ThumbnailGeneration, {
        command: JobCommand.Resume,
        force: false,
      });

      await utils.jobCommand(admin.accessToken, JobName.FaceDetection, {
        command: JobCommand.Resume,
        force: false,
      });

      await utils.jobCommand(admin.accessToken, JobName.SmartSearch, {
        command: JobCommand.Resume,
        force: false,
      });

      await utils.jobCommand(admin.accessToken, JobName.DuplicateDetection, {
        command: JobCommand.Resume,
        force: false,
      });

      const config = await utils.getSystemConfig(admin.accessToken);
      config.machineLearning.duplicateDetection.enabled = false;
      config.machineLearning.enabled = false;
      config.metadata.faces.import = false;
      config.machineLearning.clip.enabled = false;
      await updateConfig({ systemConfigDto: config }, { headers: asBearerAuth(admin.accessToken) });
    });

    it('should require authentication', async () => {
      const { status, body } = await request(app).put('/jobs/metadataExtraction');
      expect(status).toBe(401);
      expect(body).toEqual(errorDto.unauthorized);
    });

    it('should queue metadata extraction for missing assets', async () => {
      const path = `${testAssetDir}/formats/raw/Nikon/D700/philadelphia.nef`;

      await utils.jobCommand(admin.accessToken, JobName.MetadataExtraction, {
        command: JobCommand.Pause,
        force: false,
      });

      const { id } = await utils.createAsset(admin.accessToken, {
        assetData: { bytes: await readFile(path), filename: basename(path) },
      });

      await utils.waitForQueueFinish(admin.accessToken, 'metadataExtraction');

      {
        const asset = await utils.getAssetInfo(admin.accessToken, id);

        expect(asset.exifInfo).toBeDefined();
        expect(asset.exifInfo?.make).toBeNull();
      }

      await utils.jobCommand(admin.accessToken, JobName.MetadataExtraction, {
        command: JobCommand.Empty,
        force: false,
      });

      await utils.waitForQueueFinish(admin.accessToken, 'metadataExtraction');

      await utils.jobCommand(admin.accessToken, JobName.MetadataExtraction, {
        command: JobCommand.Resume,
        force: false,
      });

      await utils.jobCommand(admin.accessToken, JobName.MetadataExtraction, {
        command: JobCommand.Start,
        force: false,
      });

      await utils.waitForQueueFinish(admin.accessToken, 'metadataExtraction');

      {
        const asset = await utils.getAssetInfo(admin.accessToken, id);

        expect(asset.exifInfo).toBeDefined();
        expect(asset.exifInfo?.make).toBe('NIKON CORPORATION');
      }
    });

    it('should not re-extract metadata for existing assets', async () => {
      const path = `${testAssetDir}/temp/metadata/asset.jpg`;

      cpSync(`${testAssetDir}/formats/raw/Nikon/D700/philadelphia.nef`, path);

      const { id } = await utils.createAsset(admin.accessToken, {
        assetData: { bytes: await readFile(path), filename: basename(path) },
      });

      await utils.waitForQueueFinish(admin.accessToken, 'metadataExtraction');

      {
        const asset = await utils.getAssetInfo(admin.accessToken, id);

        expect(asset.exifInfo).toBeDefined();
        expect(asset.exifInfo?.model).toBe('NIKON D700');
      }

      cpSync(`${testAssetDir}/formats/raw/Nikon/D80/glarus.nef`, path);

      await utils.jobCommand(admin.accessToken, JobName.MetadataExtraction, {
        command: JobCommand.Start,
        force: false,
      });

      await utils.waitForQueueFinish(admin.accessToken, 'metadataExtraction');

      {
        const asset = await utils.getAssetInfo(admin.accessToken, id);

        expect(asset.exifInfo).toBeDefined();
        expect(asset.exifInfo?.model).toBe('NIKON D700');
      }

      rmSync(path);
    });

    it('should queue thumbnail extraction for assets missing thumbs', async () => {
      const path = `${testAssetDir}/albums/nature/tanners_ridge.jpg`;

      await utils.jobCommand(admin.accessToken, JobName.ThumbnailGeneration, {
        command: JobCommand.Pause,
        force: false,
      });

      const { id } = await utils.createAsset(admin.accessToken, {
        assetData: { bytes: await readFile(path), filename: basename(path) },
      });

      await utils.waitForQueueFinish(admin.accessToken, JobName.MetadataExtraction);
      await utils.waitForQueueFinish(admin.accessToken, JobName.ThumbnailGeneration);

      const assetBefore = await utils.getAssetInfo(admin.accessToken, id);
      expect(assetBefore.thumbhash).toBeNull();

      await utils.jobCommand(admin.accessToken, JobName.ThumbnailGeneration, {
        command: JobCommand.Empty,
        force: false,
      });

      await utils.waitForQueueFinish(admin.accessToken, JobName.MetadataExtraction);
      await utils.waitForQueueFinish(admin.accessToken, JobName.ThumbnailGeneration);

      await utils.jobCommand(admin.accessToken, JobName.ThumbnailGeneration, {
        command: JobCommand.Resume,
        force: false,
      });

      await utils.jobCommand(admin.accessToken, JobName.ThumbnailGeneration, {
        command: JobCommand.Start,
        force: false,
      });

      await utils.waitForQueueFinish(admin.accessToken, JobName.MetadataExtraction);
      await utils.waitForQueueFinish(admin.accessToken, JobName.ThumbnailGeneration);

      const assetAfter = await utils.getAssetInfo(admin.accessToken, id);
      expect(assetAfter.thumbhash).not.toBeNull();
    });

    it('should not reload existing thumbnail when running thumb job for missing assets', async () => {
      const path = `${testAssetDir}/temp/thumbs/asset1.jpg`;

      cpSync(`${testAssetDir}/albums/nature/tanners_ridge.jpg`, path);

      const { id } = await utils.createAsset(admin.accessToken, {
        assetData: { bytes: await readFile(path), filename: basename(path) },
      });

      await utils.waitForQueueFinish(admin.accessToken, JobName.MetadataExtraction);
      await utils.waitForQueueFinish(admin.accessToken, JobName.ThumbnailGeneration);

      const assetBefore = await utils.getAssetInfo(admin.accessToken, id);

      cpSync(`${testAssetDir}/albums/nature/notocactus_minimus.jpg`, path);

      await utils.jobCommand(admin.accessToken, JobName.ThumbnailGeneration, {
        command: JobCommand.Resume,
        force: false,
      });

      // This runs the missing thumbnail job
      await utils.jobCommand(admin.accessToken, JobName.ThumbnailGeneration, {
        command: JobCommand.Start,
        force: false,
      });

      await utils.waitForQueueFinish(admin.accessToken, JobName.MetadataExtraction);
      await utils.waitForQueueFinish(admin.accessToken, JobName.ThumbnailGeneration);

      const assetAfter = await utils.getAssetInfo(admin.accessToken, id);

      // Asset 1 thumbnail should be untouched since its thumb should not have been reloaded, even though the file was changed
      expect(assetAfter.thumbhash).toEqual(assetBefore.thumbhash);

      rmSync(path);
    });

    it('should queue duplicate detection for missing duplicates', async () => {
      {
        const config = await utils.getSystemConfig(admin.accessToken);
        config.machineLearning.duplicateDetection.enabled = false;
        config.machineLearning.enabled = false;
        config.machineLearning.clip.enabled = false;
        await updateConfig({ systemConfigDto: config }, { headers: asBearerAuth(admin.accessToken) });
      }

      const path1 = `${testAssetDir}/temp/dupes/asset1.jpg`;
      const path2 = `${testAssetDir}/temp/dupes/asset2.jpg`;

      cpSync(`${testAssetDir}/albums/nature/tanners_ridge.jpg`, `${testAssetDir}/temp/dupes/asset1.jpg`);
      cpSync(`${testAssetDir}/albums/nature/tanners_ridge.jpg`, `${testAssetDir}/temp/dupes/asset2.jpg`);

      const flipBit = async (filePath: string) => {
        const buffer = await readFile(filePath);
        buffer[5000] ^= 1;
        await writeFile(filePath, buffer);
      };

      await flipBit(path2);

      const { id: id1 } = await utils.createAsset(admin.accessToken, {
        assetData: { bytes: await readFile(path1), filename: basename(path1) },
      });

      const { id: id2 } = await utils.createAsset(admin.accessToken, {
        assetData: { bytes: await readFile(path2), filename: basename(path2) },
      });

      await utils.waitForQueueFinish(admin.accessToken, JobName.MetadataExtraction);
      await utils.waitForQueueFinish(admin.accessToken, JobName.ThumbnailGeneration);

      {
        const asset1 = await utils.getAssetInfo(admin.accessToken, id1);

        expect(asset1.duplicateId).toBeNull();

        const asset2 = await utils.getAssetInfo(admin.accessToken, id1);

        expect(asset2.duplicateId).toBeNull();
      }

      const config = await utils.getSystemConfig(admin.accessToken);
      config.machineLearning.duplicateDetection.enabled = true;
      config.machineLearning.enabled = true;
      config.machineLearning.clip.enabled = true;
      await updateConfig({ systemConfigDto: config }, { headers: asBearerAuth(admin.accessToken) });

      await utils.jobCommand(admin.accessToken, JobName.SmartSearch, {
        command: JobCommand.Start,
        force: false,
      });

      await utils.waitForQueueFinish(admin.accessToken, JobName.SmartSearch, 60_000);

      await utils.jobCommand(admin.accessToken, JobName.DuplicateDetection, {
        command: JobCommand.Start,
        force: false,
      });

      await utils.waitForQueueFinish(admin.accessToken, JobName.DuplicateDetection, 60_000);

      {
        const asset1 = await utils.getAssetInfo(admin.accessToken, id1);

        expect(asset1.duplicateId).not.toBeNull();
        expect(asset1.duplicateId).not.toBeUndefined();

        const asset2 = await utils.getAssetInfo(admin.accessToken, id2);

        expect(asset2.duplicateId).not.toBeNull();
        expect(asset2.duplicateId).not.toBeUndefined();

        expect(asset1.duplicateId).toEqual(asset2.duplicateId);
      }

      rmSync(`${testAssetDir}/temp/dupes/asset1.jpg`);
      rmSync(`${testAssetDir}/temp/dupes/asset2.jpg`);
    }, 120_000);

    it('should queue smart search for missing assets', async () => {
      {
        const config = await utils.getSystemConfig(admin.accessToken);
        config.machineLearning.enabled = false;
        config.machineLearning.clip.enabled = false;
        await updateConfig({ systemConfigDto: config }, { headers: asBearerAuth(admin.accessToken) });
      }

      const path = `${testAssetDir}/albums/nature/prairie_falcon.jpg`;

      await utils.createAsset(admin.accessToken, {
        assetData: { bytes: await readFile(path), filename: basename(path) },
      });

      await utils.waitForQueueFinish(admin.accessToken, JobName.MetadataExtraction);
      await utils.waitForQueueFinish(admin.accessToken, JobName.ThumbnailGeneration);
      await utils.waitForQueueFinish(admin.accessToken, JobName.SmartSearch);

      {
        try {
          await utils.searchSmart(admin.accessToken, { query: 'bird' });
        } catch (error: any) {
          expect(error.status).toBe(400);
          expect(error.data.message).toBe('Smart search is not enabled');
        }
      }

      const config = await utils.getSystemConfig(admin.accessToken);
      config.machineLearning.enabled = true;
      config.machineLearning.clip.enabled = true;
      await updateConfig({ systemConfigDto: config }, { headers: asBearerAuth(admin.accessToken) });

      await utils.jobCommand(admin.accessToken, JobName.SmartSearch, {
        command: JobCommand.Start,
        force: false,
      });

      await utils.waitForQueueFinish(admin.accessToken, JobName.SmartSearch, 60_000);

      {
        const results = await utils.searchSmart(admin.accessToken, { query: 'bird' });
        expect(results.assets.count).toBeGreaterThanOrEqual(1);
      }
    }, 60_000);

    it('should not re-do smart search for already-indexed assets', async () => {
      {
        const config = await utils.getSystemConfig(admin.accessToken);
        config.machineLearning.enabled = true;
        config.machineLearning.clip.enabled = true;
        await updateConfig({ systemConfigDto: config }, { headers: asBearerAuth(admin.accessToken) });
      }

      const path = `${testAssetDir}/temp/smart/asset.jpg`;

      cpSync(`${testAssetDir}/albums/nature/tanners_ridge.jpg`, path);

      await utils.createAsset(admin.accessToken, {
        assetData: { bytes: await readFile(path), filename: basename(path) },
      });

      await utils.waitForQueueFinish(admin.accessToken, JobName.MetadataExtraction);
      await utils.waitForQueueFinish(admin.accessToken, JobName.ThumbnailGeneration);
      await utils.waitForQueueFinish(admin.accessToken, JobName.SmartSearch);

      {
        const results = await utils.searchSmart(admin.accessToken, { query: 'bird' });
        expect(results.assets.count).toBeGreaterThanOrEqual(1);
      }

      cpSync(`${testAssetDir}/albums/nature/el_torcal_rocks.jpg`, path);

      await utils.jobCommand(admin.accessToken, JobName.SmartSearch, {
        command: JobCommand.Start,
        force: false,
      });

      await utils.waitForQueueFinish(admin.accessToken, JobName.SmartSearch, 60_000);

      {
        const results = await utils.searchSmart(admin.accessToken, { query: 'bird' });
        expect(results.assets.count).toBeGreaterThanOrEqual(1);
      }

      rmSync(path);
    }, 60_000);

    it('should queue face detection for missing faces', async () => {
      const path = `${testAssetDir}/metadata/faces/solvay.jpg`;

      await utils.jobCommand(admin.accessToken, JobName.FaceDetection, {
        command: JobCommand.Pause,
        force: false,
      });

      await utils.jobCommand(admin.accessToken, JobName.FacialRecognition, {
        command: JobCommand.Pause,
        force: false,
      });

      const { id } = await utils.createAsset(admin.accessToken, {
        assetData: { bytes: await readFile(path), filename: basename(path) },
      });

      await utils.waitForQueueFinish(admin.accessToken, JobName.MetadataExtraction);
      await utils.waitForQueueFinish(admin.accessToken, JobName.ThumbnailGeneration);
      await utils.waitForQueueFinish(admin.accessToken, JobName.FaceDetection);

      {
        const asset = await utils.getAssetInfo(admin.accessToken, id);
        expect(asset.people).toEqual([]);
        expect(asset.unassignedFaces).toBeUndefined();
      }

      await utils.jobCommand(admin.accessToken, JobName.FaceDetection, {
        command: JobCommand.Empty,
        force: false,
      });

      await utils.waitForQueueFinish(admin.accessToken, JobName.MetadataExtraction);
      await utils.waitForQueueFinish(admin.accessToken, JobName.ThumbnailGeneration);
      await utils.waitForQueueFinish(admin.accessToken, JobName.FaceDetection);

      await utils.jobCommand(admin.accessToken, JobName.FaceDetection, {
        command: JobCommand.Resume,
        force: false,
      });

      await utils.jobCommand(admin.accessToken, JobName.FacialRecognition, {
        command: JobCommand.Resume,
        force: false,
      });

      const config = await utils.getSystemConfig(admin.accessToken);
      config.metadata.faces.import = true;
      config.machineLearning.enabled = true;
      await updateConfig({ systemConfigDto: config }, { headers: asBearerAuth(admin.accessToken) });

      await utils.jobCommand(admin.accessToken, JobName.FaceDetection, {
        command: JobCommand.Start,
        force: false,
      });

      await utils.waitForQueueFinish(admin.accessToken, JobName.MetadataExtraction);
      await utils.waitForQueueFinish(admin.accessToken, JobName.ThumbnailGeneration);
      await utils.waitForQueueFinish(admin.accessToken, JobName.FaceDetection, 60_000);
      await utils.waitForQueueFinish(admin.accessToken, JobName.FacialRecognition);

      {
        const asset = await utils.getAssetInfo(admin.accessToken, id);

        expect(asset.people).toEqual([]);
        expect(asset.unassignedFaces?.length).toBeGreaterThan(10);
      }
    }, 60_000);

    it('should not rerun face detection for existing faces', async () => {
      const config = await utils.getSystemConfig(admin.accessToken);
      config.metadata.faces.import = true;
      config.machineLearning.enabled = true;
      await updateConfig({ systemConfigDto: config }, { headers: asBearerAuth(admin.accessToken) });

      const path = `${testAssetDir}/temp/faces/asset.jpg`;

      cpSync(`${testAssetDir}/metadata/faces/solvay.jpg`, path);

      const { id } = await utils.createAsset(admin.accessToken, {
        assetData: { bytes: await readFile(path), filename: basename(path) },
      });

      await utils.waitForQueueFinish(admin.accessToken, JobName.MetadataExtraction);
      await utils.waitForQueueFinish(admin.accessToken, JobName.ThumbnailGeneration);
      await utils.waitForQueueFinish(admin.accessToken, JobName.FaceDetection);

      {
        const asset = await utils.getAssetInfo(admin.accessToken, id);
        expect(asset.people).toEqual([]);
        expect(asset.unassignedFaces?.length).toBeGreaterThan(10);
      }

      cpSync(`${testAssetDir}/albums/nature/el_torcal_rocks.jpg`, path);

      await utils.jobCommand(admin.accessToken, JobName.FaceDetection, {
        command: JobCommand.Start,
        force: false,
      });

      await utils.waitForQueueFinish(admin.accessToken, JobName.MetadataExtraction);
      await utils.waitForQueueFinish(admin.accessToken, JobName.ThumbnailGeneration);
      await utils.waitForQueueFinish(admin.accessToken, JobName.FaceDetection, 60_000);

      {
        const asset = await utils.getAssetInfo(admin.accessToken, id);

        expect(asset.people).toEqual([]);
        expect(asset.unassignedFaces?.length).toBeGreaterThan(10);
      }

      rmSync(path);
    }, 60_000);
  });
});
