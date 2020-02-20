import * as Lint from "tslint";
import * as ts from "typescript";
import * as tsutils from "tsutils";
import { tsquery } from "@phenomnomnominal/tsquery";
import { dedent } from "tslint/lib/utils";

export class Rule extends Lint.Rules.TypedRule {

    public static FAILURE_STRING = 'call to super.{methodName}() is missing';

    public static metadata: Lint.IRuleMetadata = {
        description: dedent`Enforces the application to call parent lifecycle function e.g. super.ngOnDestroy()
                        when using inheritance within an Angular component or directive.`,
        options: null,
        optionsDescription: "",
        requiresTypeInfo: true,
        ruleName: "angular-call-super-lifecycle-method-in-extended-class",
        type: "functionality",
        typescriptOnly: true
    };

    private componentLifeCycleMethods: string[] = [
        "ngOnDestroy",
        "ngOnInit",
        "ngAfterViewInit",
        "ngAfterContentInit",
        "ngOnChanges",
        "ngDoCheck",
        "ngAfterContentChecked",
        "ngAfterViewChecked"
    ];
    private directiveLifeCycleMethods: string[] = [
        "ngOnDestroy",
        "ngOnInit"
    ];

    public applyWithProgram(
        sourceFile: ts.SourceFile,
        program: ts.Program
    ): Lint.RuleFailure[] {
        const failures: Lint.RuleFailure[] = [];

        // find all classes with an @Component() decorator and heritage clause
        const componentClassDeclarations = tsquery(
            sourceFile,
            `ClassDeclaration:has(Decorator[expression.expression.name='Component']):has(HeritageClause:has(ExpressionWithTypeArguments))`
        ) as ts.ClassDeclaration[];

        // find all classes with an @Directive() decorator and heritage clause
        const directiveClassDeclarations = tsquery(
            sourceFile,
            `ClassDeclaration:has(Decorator[expression.expression.name='Directive']):has(HeritageClause:has(ExpressionWithTypeArguments))`
        ) as ts.ClassDeclaration[];

        // check all components
        [
            ...componentClassDeclarations,
            ...componentClassDeclarations
                .map(classDeclaration => this.findParentClasses(program, classDeclaration))
                .reduce((allParentClasses, parentClasses) => [...allParentClasses, ...parentClasses], [])
        ].forEach(classDeclaration => {
            failures.push(
                ...this.checkLifeCycleMethodSuperInvokation(
                    classDeclaration.getSourceFile(),
                    program,
                    classDeclaration as ts.ClassDeclaration,
                    false
                )
            );
        });

        // check all directives
        [
            ...directiveClassDeclarations,
            ...directiveClassDeclarations
                .map(classDeclaration => this.findParentClasses(program, classDeclaration))
                .reduce((allParentClasses, parentClasses) => [...allParentClasses, ...parentClasses], [])
        ].forEach(classDeclaration => {
            failures.push(
                ...this.checkLifeCycleMethodSuperInvokation(
                    classDeclaration.getSourceFile(),
                    program,
                    classDeclaration as ts.ClassDeclaration,
                    true
                )
            );
        });

        return failures;
    }

    /**
     * Verify that a class implementing a lifecycle method calls super.lifeCycleMethod() if it overrides any parent implementation of it
     */
    private checkLifeCycleMethodSuperInvokation(sourceFile: ts.SourceFile,
                                                program: ts.Program,
                                                classDeclaration: ts.ClassDeclaration,
                                                isDirective: boolean): Lint.RuleFailure[] {
        const lintFailures: Lint.RuleFailure[] = [];
        const lifeCycleMethodsToCheck = isDirective ? this.directiveLifeCycleMethods : this.componentLifeCycleMethods;

        // check all life cycle methods
        lifeCycleMethodsToCheck.forEach(lifeCycleMethodName => {
            // find an implementation of the lifecycle method
            const lifeCycleMethod = this.findLifeCycleMethod(classDeclaration, lifeCycleMethodName);

            // if implementation found, check parent implementations are called when overriding
            if (lifeCycleMethod) {
                const parentClasses = this.findParentClasses(program, classDeclaration);
                if (parentClasses.some(parentClass => !!this.findLifeCycleMethod(parentClass, lifeCycleMethodName))) {
                    // some parent has life cycle method implementation, ensure super.lifeCycleMethod() is called
                    const superLifeCycleMethodCall = this.findSuperLifeCycleMethodInvocation(lifeCycleMethod, lifeCycleMethodName);
                    if (!superLifeCycleMethodCall) {
                        lintFailures.push(
                            new Lint.RuleFailure(
                                sourceFile,
                                lifeCycleMethod.name ? lifeCycleMethod.name.getStart() : sourceFile.getStart(),
                                lifeCycleMethod.name ? lifeCycleMethod.name.getStart() +
                                    lifeCycleMethod.name.getWidth() : sourceFile.getStart() + sourceFile.getWidth(),
                                Rule.FAILURE_STRING.replace("{methodName}", lifeCycleMethod.name.getText()),
                                this.ruleName
                            )
                        )
                    }
                }
            }
        });
        return lintFailures;
    }

    /**
     * Returns the method declaration of the life cycle method implemenation in the class given
     */
    private findLifeCycleMethod(
        classDeclaration: ts.ClassDeclaration,
        lifeCycleMethodName: string
    ): ts.MethodDeclaration {
        return classDeclaration.members.find(
            member => member.name && member.name.getText() === lifeCycleMethodName
        ) as ts.MethodDeclaration;
    }

    /**
     * Returns the property access expression of the invocation of super.lifeCycleMethod(), if any
     */
    private findSuperLifeCycleMethodInvocation(
        methodDeclaration: ts.MethodDeclaration,
        lifeCycleMethodName: string
    ): ts.PropertyAccessExpression | undefined {

        if (!methodDeclaration.body) {
            return undefined;
        }

        const propertyAccessExpressions = tsquery(
            methodDeclaration,
            `CallExpression > PropertyAccessExpression[expression.kind=${ts.SyntaxKind.SuperKeyword}][name.text="${lifeCycleMethodName}"]`
        ) as ts.PropertyAccessExpression[];
        if (propertyAccessExpressions && propertyAccessExpressions.length > 0) {
            return propertyAccessExpressions[0];
        }
    }

    /**
     * recursively find all parent classes of the class given
     */
    private findParentClasses(
        program: ts.Program,
        classDeclarationToBeChecked: ts.ClassDeclaration
    ): ts.ClassDeclaration[] {
        const classDeclarationsFound: ts.ClassDeclaration[] = [];
        const typeChecker = program.getTypeChecker();

        const heritageClauses = classDeclarationToBeChecked.heritageClauses;

        if (!heritageClauses) {
            return [];
        }
        heritageClauses.forEach(heritageClause => {
            if (heritageClause.token === ts.SyntaxKind.ExtendsKeyword) {
                heritageClause.types.forEach(heritageClauseType => {
                    if (!tsutils.isIdentifier(heritageClauseType.expression)) {
                        return;
                    }
                    const extendType = typeChecker.getTypeAtLocation(heritageClauseType.expression);
                    if (extendType && extendType.symbol
                        && extendType.symbol.declarations
                        && extendType.symbol.declarations.length > 0
                        && tsutils.isClassDeclaration(extendType.symbol.declarations[0])
                    ) {
                        const parentClassDeclaration = extendType.symbol.declarations[0] as ts.ClassDeclaration;
                        classDeclarationsFound.push(parentClassDeclaration);
                        classDeclarationsFound.push(...this.findParentClasses(program, parentClassDeclaration))
                    }
                })
            }
        });
        return classDeclarationsFound;
    };
}
