pipeline {
    agent any
    environment {
        // Ensure the NVM path is available
        NVM_DIR = '/home/ubuntu/.nvm'
        NODE_VERSION = 'v14.0.0'
    }
    stages {
        stage('Upload Build') {
            steps {
                sshPublisher(publishers: [
                    sshPublisherDesc(
                        configName: 'Esg-CSR',
                        transfers: [
                            sshTransfer(
                                cleanRemote: false,
                                execCommand: """
                                    export NVM_DIR=${NVM_DIR} && \
                                    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && \
                                    nvm use ${NODE_VERSION} && \
                                    cd /var/www/CSR_BE && \
                                    git reset --hard && \
                                    git pull origin main && \
                                    npm install -f && \
                                    pm2 delete CSR_BE || true && \
                                    pm2 start npm --name CSR_BE -- start
                                """,
                                execTimeout: 120000,
                                flatten: false,
                                makeEmptyDirs: false,
                                noDefaultExcludes: false,
                                patternSeparator: '[, ]+',
                                remoteDirectory: '/',
                                remoteDirectorySDF: false,
                                removePrefix: '',
                                sourceFiles: 'package.json'
                            )
                        ],
                        usePromotionTimestamp: false,
                        useWorkspaceInPromotion: false,
                        verbose: true
                    )
                ])
            }
        }
    }
}
