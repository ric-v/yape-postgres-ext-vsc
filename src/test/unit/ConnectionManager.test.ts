import { expect } from 'chai';
import * as sinon from 'sinon';
import { ConnectionManager } from '../../services/ConnectionManager';
import { SecretStorageService } from '../../services/SecretStorageService';
import { Client } from 'pg';

describe('ConnectionManager', () => {
    let sandbox: sinon.SinonSandbox;
    let secretStorageStub: sinon.SinonStubbedInstance<SecretStorageService>;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        // Mock SecretStorageService
        secretStorageStub = sandbox.createStubInstance(SecretStorageService);
        (SecretStorageService as any).instance = secretStorageStub;
        sandbox.stub(SecretStorageService, 'getInstance').returns(secretStorageStub as any);
    });

    afterEach(() => {
        sandbox.restore();
        // Reset singleton instance
        (ConnectionManager as any).instance = undefined;
    });

    it('should be a singleton', () => {
        const instance1 = ConnectionManager.getInstance();
        const instance2 = ConnectionManager.getInstance();
        expect(instance1).to.equal(instance2);
    });

    it('should create a new connection if one does not exist', async () => {
        const manager = ConnectionManager.getInstance();
        const config = {
            id: 'test-id',
            host: 'localhost',
            port: 5432,
            username: 'user',
            database: 'testdb',
            name: 'Test DB'
        };

        const clientStub = {
            connect: sandbox.stub().resolves(),
            on: sandbox.stub(),
            end: sandbox.stub().resolves()
        };

        // Mock pg.Client constructor
        const pgClientStub = sandbox.stub(require('pg'), 'Client').returns(clientStub);

        const client = await manager.getConnection(config);

        expect(pgClientStub.calledOnce).to.be.true;
        expect(clientStub.connect.calledOnce).to.be.true;
        expect(client).to.equal(clientStub);
    });

    it('should reuse existing connection', async () => {
        const manager = ConnectionManager.getInstance();
        const config = {
            id: 'test-id',
            host: 'localhost',
            port: 5432,
            username: 'user',
            database: 'testdb',
            name: 'Test DB'
        };

        const clientStub = {
            connect: sandbox.stub().resolves(),
            on: sandbox.stub(),
            end: sandbox.stub().resolves()
        };

        sandbox.stub(require('pg'), 'Client').returns(clientStub);

        const client1 = await manager.getConnection(config);
        const client2 = await manager.getConnection(config);

        expect(client1).to.equal(client2);
        // Should only be called once
        expect(clientStub.connect.calledOnce).to.be.true;
    });

    it('should close connection', async () => {
        const manager = ConnectionManager.getInstance();
        const config = {
            id: 'test-id',
            host: 'localhost',
            port: 5432,
            username: 'user',
            database: 'testdb',
            name: 'Test DB'
        };

        const clientStub = {
            connect: sandbox.stub().resolves(),
            on: sandbox.stub(),
            end: sandbox.stub().resolves()
        };

        sandbox.stub(require('pg'), 'Client').returns(clientStub);

        await manager.getConnection(config);
        await manager.closeConnection(config);

        expect(clientStub.end.calledOnce).to.be.true;
    });

    it('should close all connections', async () => {
        const manager = ConnectionManager.getInstance();
        const config1 = { id: '1', host: 'h', port: 1, username: 'u', database: 'd1', name: 'n' };
        const config2 = { id: '2', host: 'h', port: 1, username: 'u', database: 'd2', name: 'n' };

        const clientStub1 = { connect: sandbox.stub().resolves(), on: sandbox.stub(), end: sandbox.stub().resolves() };
        const clientStub2 = { connect: sandbox.stub().resolves(), on: sandbox.stub(), end: sandbox.stub().resolves() };

        const pgClientStub = sandbox.stub(require('pg'), 'Client');
        pgClientStub.onCall(0).returns(clientStub1);
        pgClientStub.onCall(1).returns(clientStub2);

        await manager.getConnection(config1);
        await manager.getConnection(config2);
        await manager.closeAll();

        expect(clientStub1.end.calledOnce).to.be.true;
        expect(clientStub2.end.calledOnce).to.be.true;
    });
});
